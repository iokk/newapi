package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestClientLinkEndpoints(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/client_link.db?_pragma=busy_timeout(30000)&_txlock=immediate"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}))
	prevDB, prevLog, prevRedis := model.DB, model.LOG_DB, common.RedisEnabled
	prevSetting, prevAddr := *operation_setting.GetClientLinkSetting(), system_setting.ServerAddress
	model.DB, model.LOG_DB, common.RedisEnabled = db, db, false
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled = prevDB, prevLog, prevRedis
		*operation_setting.GetClientLinkSetting() = prevSetting
		system_setting.ServerAddress = prevAddr
	})
	*operation_setting.GetClientLinkSetting() = operation_setting.ClientLinkSetting{
		Enabled: true, AnonymousDailyLimit: 10, WorkBuddyModels: `[{"id":"m1","name":"AG","vendor":"x"}]`,
	}
	system_setting.ServerAddress = "https://api.example.com"
	owner := &model.User{Username: "owner", Password: "password-12345", DisplayName: "owner", Role: common.RoleCommonUser}
	require.NoError(t, owner.Insert(0))

	router := gin.New()
	router.GET("/c/:code", ClientLinkGuide)
	router.GET("/c/:code/code", ClientLinkExchange)
	router.GET("/k/:dl/:file", ClientLinkRedeem)
	router.POST("/api/client_link", func(c *gin.Context) { c.Set("id", owner.Id); CreateClientLink(c) })
	do := func(method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	device := map[string]string{"X-Client-Os": "Darwin", "X-Client-Wb": "wb-1", "X-Client-Hw": "hw-1"}

	created := do("POST", "/api/client_link", `{"target":"workbuddy"}`, nil)
	require.Equal(t, http.StatusOK, created.Code)
	var link struct {
		Data struct {
			Code       string `json:"code"`
			GuideURL   string `json:"guide_url"`
			LandingURL string `json:"landing_url"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(created.Body.Bytes(), &link))
	assert.Equal(t, "https://api.example.com/c/"+link.Data.Code+"?t=workbuddy", link.Data.GuideURL)
	assert.Equal(t, "https://api.example.com/s/"+link.Data.Code+"?t=workbuddy", link.Data.LandingURL)

	guide := do("GET", "/c/"+link.Data.Code+"?t=workbuddy", "", nil)
	assert.Equal(t, http.StatusOK, guide.Code)
	assert.Contains(t, guide.Header().Get("Content-Type"), "text/plain")
	assert.Contains(t, guide.Body.String(), "/c/"+link.Data.Code+"/code?t=workbuddy")
	assert.NotContains(t, guide.Body.String(), "sk-")

	// An unknown code, a missing device header and a bad target all look the same.
	unknown := do("GET", "/c/u-unknown/code?t=workbuddy", "", device)
	missing := do("GET", "/c/"+link.Data.Code+"/code?t=workbuddy", "", map[string]string{"X-Client-Os": "Darwin"})
	badTarget := do("GET", "/c/"+link.Data.Code+"/code?t=x", "", device)
	for _, rec := range []*httptest.ResponseRecorder{unknown, missing, badTarget} {
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Equal(t, unknown.Body.String(), rec.Body.String())
	}
	assert.Equal(t, http.StatusNotFound, do("GET", "/c/u%20x%0Ainject?t=workbuddy", "", nil).Code)

	exchanged := do("GET", "/c/"+link.Data.Code+"/code?t=workbuddy", "", device)
	require.Equal(t, http.StatusOK, exchanged.Code)
	dl := exchanged.Body.String()
	require.True(t, strings.HasPrefix(dl, "k-"))

	first := do("GET", "/k/"+dl+"/models.json", "", device)
	require.Equal(t, http.StatusOK, first.Code)
	assert.Contains(t, first.Body.String(), `"apiKey":"sk-`)
	assert.Contains(t, first.Body.String(), "https://api.example.com/v1/chat/completions")
	assert.Equal(t, http.StatusNotFound, do("GET", "/k/"+dl+"/models.json", "", device).Code, "replay")

	// Anonymous sharing stays off until the admin turns it on.
	share := do("POST", "/api/client_link", `{"target":"workbuddy","share":true}`, nil)
	assert.Contains(t, share.Body.String(), `"success":false`)
}
