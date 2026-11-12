package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// ClientLinkSetting 控制"客户端一键配置链接"（WorkBuddy / DSH）。
// 体验额度不在这里设置，复用「新用户额度」和「受邀额度」。
type ClientLinkSetting struct {
	Enabled             bool `json:"enabled"`
	AnonymousEnabled    bool `json:"anonymous_enabled"`     // 允许未注册用户通过分享链接静默建号
	AnonymousDailyLimit int  `json:"anonymous_daily_limit"` // 每日最多静默建号数
	// WorkBuddyModels 是 WorkBuddy models.json 的条目模板（JSON 数组），
	// 服务端只补 apiKey 和缺省的 url。
	WorkBuddyModels string `json:"workbuddy_models"`
	// DshKeyEnv 必须与 DshProvidersYaml 里的 apiKeyEnv 一致。
	DshKeyEnv        string `json:"dsh_key_env"`
	DshProvidersYaml string `json:"dsh_providers_yaml"` // providers: 下的供应商片段，不含 Key
}

var clientLinkSetting = ClientLinkSetting{
	AnonymousDailyLimit: 100,
	DshKeyEnv:           "NEWAPI_API_KEY",
}

func init() {
	config.GlobalConfig.Register("client_link_setting", &clientLinkSetting)
}

func GetClientLinkSetting() *ClientLinkSetting {
	return &clientLinkSetting
}
