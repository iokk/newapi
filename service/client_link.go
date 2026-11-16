package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/cachex"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/samber/hot"
	"gorm.io/gorm"
)

const (
	clientLinkAnonRemark  = "client_link:anon"
	clientLinkUserPrefix  = "u-" // 登录用户生成的链接码
	clientLinkSharePrefix = "a-" // 分享码：a- + 分享者的 AffCode
	clientLinkDownloadPre = "k-"
)

var (
	clientLinkTTL         = 30 * time.Minute
	clientLinkDownloadTTL = 10 * time.Minute

	// ErrClientLinkUnavailable is the only error shown to clients, so a caller
	// cannot tell an unknown code from an expired, used or disabled one.
	ErrClientLinkUnavailable = errors.New("client link unavailable")
)

// clientLinkTargets maps a target to the token name and the file it downloads.
var clientLinkTargets = map[string]struct{ tokenName, file string }{
	"workbuddy": {"WorkBuddy", "models.json"},
	"dsh":       {"DSH", "dsh.json"},
}

// Device is the client-reported fingerprint. It is a speed bump, not proof:
// anyone can forge it, so abuse limits must not rely on it alone.
type Device struct{ OS, WB, HW string }

// Hash returns the hex sha256 of the device fields, or false if an input is
// oversized or OS/HW are missing. WB stays optional: a machine without
// WorkBuddy installed yet has no device-id file, and HW alone still binds the
// download code to the machine.
func (d Device) Hash() (string, bool) {
	if d.OS == "" || d.HW == "" {
		return "", false
	}
	for _, v := range []string{d.OS, d.WB, d.HW} {
		if len(v) > 128 {
			return "", false
		}
	}
	sum := sha256.Sum256([]byte(d.OS + "\x00" + d.WB + "\x00" + d.HW))
	return hex.EncodeToString(sum[:]), true
}

type clientLinkEntry struct {
	UserID int    `json:"user_id"`
	Target string `json:"target,omitempty"`
	Device string `json:"device,omitempty"`
}

var (
	clientLinkCacheOnce sync.Once
	clientLinkCache     *cachex.HybridCache[clientLinkEntry]
)

// shortcut: with Redis off the codes live in process memory, so a restart or a
// second instance invalidates them; users just copy the prompt again.
func getClientLinkCache() *cachex.HybridCache[clientLinkEntry] {
	clientLinkCacheOnce.Do(func() {
		clientLinkCache = cachex.NewHybridCache(cachex.HybridCacheConfig[clientLinkEntry]{
			Namespace:    cachex.Namespace("new-api:client_link:v1"),
			Redis:        common.RDB,
			RedisEnabled: func() bool { return common.RedisEnabled && common.RDB != nil },
			RedisCodec:   cachex.JSONCodec[clientLinkEntry]{},
			Memory: func() *hot.HotCache[string, clientLinkEntry] {
				return hot.NewHotCache[string, clientLinkEntry](hot.LRU, 10000).WithTTL(clientLinkTTL).WithJanitor().Build()
			},
		})
	})
	return clientLinkCache
}

// clientLinkKey stores only the hash, so reading the cache does not reveal usable codes.
func clientLinkKey(kind, code string) string {
	sum := sha256.Sum256([]byte(code))
	return kind + hex.EncodeToString(sum[:])
}

func newClientLinkCode(prefix string) (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)), nil
}

// ClientLinkBase is the public site address used in prompts, guides and model URLs.
func ClientLinkBase() string {
	return strings.TrimRight(system_setting.ServerAddress, "/")
}

// clientLinkModelIDs returns the ids in the WorkBuddy template, or nil if it is missing or invalid.
func clientLinkModelIDs() []string {
	var entries []map[string]any
	if err := common.UnmarshalJsonStr(operation_setting.GetClientLinkSetting().WorkBuddyModels, &entries); err != nil {
		return nil
	}
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		if id, _ := e["id"].(string); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

// ClientLinkTargetReady reports whether the feature is on and the target has its template.
func ClientLinkTargetReady(target string) bool {
	s := operation_setting.GetClientLinkSetting()
	if !s.Enabled {
		return false
	}
	switch target {
	case "workbuddy":
		return len(clientLinkModelIDs()) > 0
	case "dsh":
		return s.DshProvidersYaml != "" && s.DshKeyEnv != ""
	}
	return false
}

// NewClientLink creates a link code for a logged-in user.
func NewClientLink(userID int) (string, error) {
	if !operation_setting.GetClientLinkSetting().Enabled {
		return "", ErrClientLinkUnavailable
	}
	code, err := newClientLinkCode(clientLinkUserPrefix)
	if err != nil {
		return "", err
	}
	err = getClientLinkCache().SetWithTTL(clientLinkKey("l:", code), clientLinkEntry{UserID: userID}, clientLinkTTL)
	return code, err
}

// ShareClientLink returns the user's share code, which lets a new device create an anonymous account.
func ShareClientLink(userID int) (string, error) {
	s := operation_setting.GetClientLinkSetting()
	if !s.Enabled || !s.AnonymousEnabled {
		return "", ErrClientLinkUnavailable
	}
	user, err := model.GetUserById(userID, true)
	if err != nil {
		return "", ErrClientLinkUnavailable
	}
	if user.AffCode == "" { // setup, OAuth and older accounts may not have one yet, as in GetAffCode
		user.AffCode = common.GetRandomString(4)
		if err := user.Update(false); err != nil {
			return "", err
		}
	}
	return clientLinkSharePrefix + user.AffCode, nil
}

// ExchangeClientLink validates a link code and returns a one-time download code bound to the device.
func ExchangeClientLink(code, target string, d Device) (string, error) {
	deviceHash, ok := d.Hash()
	if !ok || !ClientLinkTargetReady(target) {
		return "", ErrClientLinkUnavailable
	}
	if _, known := clientLinkTargets[target]; !known {
		return "", ErrClientLinkUnavailable
	}
	var userID int
	switch {
	case strings.HasPrefix(code, clientLinkUserPrefix):
		entry, found, err := getClientLinkCache().Get(clientLinkKey("l:", code))
		if err != nil || !found {
			return "", ErrClientLinkUnavailable
		}
		userID = entry.UserID
	case strings.HasPrefix(code, clientLinkSharePrefix) && operation_setting.GetClientLinkSetting().AnonymousEnabled:
		// Anonymous accounts are limited to the template models, so the template must exist.
		inviterID, err := model.GetUserIdByAffCode(strings.TrimPrefix(code, clientLinkSharePrefix))
		if err != nil || len(clientLinkModelIDs()) == 0 {
			return "", ErrClientLinkUnavailable
		}
		if userID, err = findOrCreateAnonymousUser(deviceHash, inviterID); err != nil {
			return "", err
		}
	default:
		return "", ErrClientLinkUnavailable
	}
	dl, err := newClientLinkCode(clientLinkDownloadPre)
	if err != nil {
		return "", err
	}
	err = getClientLinkCache().SetWithTTL(clientLinkKey("d:", dl), clientLinkEntry{UserID: userID, Target: target, Device: deviceHash}, clientLinkDownloadTTL)
	return dl, err
}

// RedeemClientLink consumes a download code exactly once and returns the config file body.
func RedeemClientLink(dl, file string, d Device) ([]byte, error) {
	deviceHash, ok := d.Hash()
	if !ok {
		return nil, ErrClientLinkUnavailable
	}
	cache, key := getClientLinkCache(), clientLinkKey("d:", dl)
	entry, found, err := cache.Get(key)
	if err != nil || !found || clientLinkTargets[entry.Target].file != file ||
		subtle.ConstantTimeCompare([]byte(entry.Device), []byte(deviceHash)) != 1 {
		return nil, ErrClientLinkUnavailable
	}
	// The delete count decides the winner when two requests redeem at once.
	deleted, err := cache.DeleteMany([]string{key})
	if err != nil || !deleted[cache.FullKey(key)] {
		return nil, ErrClientLinkUnavailable
	}
	return ClientConfigBody(entry.UserID, entry.Target)
}

// ClientConfigBody builds the config file for a user, creating the dedicated token on first use.
func ClientConfigBody(userID int, target string) ([]byte, error) {
	cfg, known := clientLinkTargets[target]
	if !known || !ClientLinkTargetReady(target) {
		return nil, ErrClientLinkUnavailable
	}
	user, err := model.GetUserById(userID, false)
	if err != nil || user.Status != common.UserStatusEnabled {
		return nil, ErrClientLinkUnavailable
	}
	token, err := model.GetUserTokenByName(user.Id, cfg.tokenName)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		key, keyErr := common.GenerateKey()
		if keyErr != nil {
			return nil, keyErr
		}
		token = &model.Token{
			UserId: user.Id, Name: cfg.tokenName, Key: key,
			CreatedTime: common.GetTimestamp(), AccessedTime: common.GetTimestamp(),
			ExpiredTime: -1, UnlimitedQuota: true, AllowUserQuotaQuery: true,
		}
		// shortcut: the model limit is fixed at creation; template changes do not reach existing anonymous tokens.
		if user.Remark == clientLinkAnonRemark {
			token.ModelLimitsEnabled, token.ModelLimits = true, strings.Join(clientLinkModelIDs(), ",")
		}
		err = token.Insert()
	}
	if err != nil {
		return nil, err
	}

	s := operation_setting.GetClientLinkSetting()
	apiKey := "sk-" + token.Key
	if target == "dsh" {
		return common.Marshal(map[string]string{"key_env": s.DshKeyEnv, "api_key": apiKey, "providers_yaml": s.DshProvidersYaml})
	}
	var entries []map[string]any
	if err := common.UnmarshalJsonStr(s.WorkBuddyModels, &entries); err != nil {
		return nil, ErrClientLinkUnavailable
	}
	for _, e := range entries {
		e["apiKey"] = apiKey
		if _, hasURL := e["url"]; !hasURL {
			e["url"] = ClientLinkBase() + "/v1/chat/completions"
		}
	}
	return common.Marshal(entries)
}

// findOrCreateAnonymousUser maps a device to one account via its username, so no table is needed.
func findOrCreateAnonymousUser(deviceHash string, inviterID int) (int, error) {
	username := "wb_" + deviceHash[:16]
	var existing model.User
	err := model.DB.Unscoped().Where("username = ?", username).First(&existing).Error
	if err == nil {
		if existing.DeletedAt.Valid || existing.Status != common.UserStatusEnabled {
			return 0, ErrClientLinkUnavailable
		}
		return existing.Id, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, err
	}

	now := time.Now()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Unix()
	var created int64
	if err := model.DB.Model(&model.User{}).Where("remark = ? AND created_at >= ?", clientLinkAnonRemark, dayStart).Count(&created).Error; err != nil {
		return 0, err
	}
	if created >= int64(operation_setting.GetClientLinkSetting().AnonymousDailyLimit) {
		return 0, ErrClientLinkUnavailable
	}

	password, err := common.GenerateRandomCharsKey(32) // nobody knows it: the account cannot log in
	if err != nil {
		return 0, err
	}
	user := &model.User{Username: username, Password: password, DisplayName: "WorkBuddy", Role: common.RoleCommonUser, Remark: clientLinkAnonRemark, InviterId: inviterID}
	if err := user.Insert(inviterID); err != nil {
		// Two first requests from one device can race on the unique username.
		if raced := model.DB.Where("username = ?", username).First(&existing).Error; raced == nil {
			return existing.Id, nil
		}
		return 0, err
	}
	return user.Id, nil
}
