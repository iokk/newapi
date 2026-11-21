package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUnifiedAuthAuditTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	prevDB, prevLogDB := model.DB, model.LOG_DB
	prevRedis, prevSecret := common.RedisEnabled, common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuditLog{}))
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.SessionSecret = "unified-auth-audit-test-secret"
	t.Cleanup(func() {
		model.DB = prevDB
		model.LOG_DB = prevLogDB
		common.RedisEnabled = prevRedis
		common.SessionSecret = prevSecret
	})
	return db
}

func TestUnifiedAuthAuditAndAdminSessions(t *testing.T) {
	db := setupUnifiedAuthAuditTestDB(t)
	gin.SetMode(gin.TestMode)

	target := &model.User{
		Username: "legacy-user", Password: "unused", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AffCode: "aff1", AuthVersion: 1,
	}
	root := &model.User{
		Username: "root-admin", Password: "unused", Role: common.RoleRootUser,
		Status: common.UserStatusEnabled, Group: "default", AffCode: "aff2", AuthVersion: 1,
	}
	require.NoError(t, db.Create(target).Error)
	require.NoError(t, db.Create(root).Error)

	// 1. Failed login + registration audit
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/login", nil)
	recordLoginFailureAudit(c, nil, "unknown-user", "password", "invalid_credentials")
	recordRegisterAudit(c, target, "oauth:oidc", 0)

	// 2. Active session creation + Admin list & revoke
	bundle, err := service.CreateLoginSession(target.Id, "oauth:oidc", "127.0.0.1", "test-ua")
	require.NoError(t, err)
	require.NotEmpty(t, bundle.Session.SID)

	// Admin lists target sessions
	listRec := httptest.NewRecorder()
	listCtx, _ := gin.CreateTestContext(listRec)
	listCtx.Request = httptest.NewRequest(http.MethodGet, "/api/user/"+strconv.Itoa(target.Id)+"/sessions", nil)
	listCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(target.Id)}}
	listCtx.Set("id", root.Id)
	listCtx.Set("role", common.RoleRootUser)
	AdminGetUserSessions(listCtx)
	assert.Equal(t, http.StatusOK, listRec.Code)
	var listResp struct {
		Success bool                       `json:"success"`
		Data    []service.LoginSessionView `json:"data"`
	}
	require.NoError(t, json.Unmarshal(listRec.Body.Bytes(), &listResp))
	assert.True(t, listResp.Success)
	assert.Len(t, listResp.Data, 1)

	// Lower-role admin cannot revoke root sessions
	denyRec := httptest.NewRecorder()
	denyCtx, _ := gin.CreateTestContext(denyRec)
	denyCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(root.Id)+"/sessions", nil)
	denyCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(root.Id)}}
	denyCtx.Set("id", 99)
	denyCtx.Set("role", common.RoleAdminUser)
	AdminRevokeUserSessions(denyCtx)
	var denyResp struct {
		Success bool `json:"success"`
	}
	require.NoError(t, json.Unmarshal(denyRec.Body.Bytes(), &denyResp))
	assert.False(t, denyResp.Success)

	// Root revokes target sessions
	revRec := httptest.NewRecorder()
	revCtx, _ := gin.CreateTestContext(revRec)
	revCtx.Request = httptest.NewRequest(http.MethodDelete, "/api/user/"+strconv.Itoa(target.Id)+"/sessions", nil)
	revCtx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(target.Id)}}
	revCtx.Set("id", root.Id)
	revCtx.Set("role", common.RoleRootUser)
	revCtx.Set("username", root.Username)
	AdminRevokeUserSessions(revCtx)
	var revResp struct {
		Success bool `json:"success"`
		Data    struct {
			RevokedCount int64 `json:"revoked_count"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(revRec.Body.Bytes(), &revResp))
	assert.True(t, revResp.Success)
	assert.Equal(t, int64(1), revResp.Data.RevokedCount)

	// Verify audit rows persisted
	var actions []string
	require.NoError(t, db.Model(&model.AuditLog{}).Pluck("action", &actions).Error)
	assert.Contains(t, actions, "login_failed")
	assert.Contains(t, actions, "user.register")
	assert.Contains(t, actions, "user.sessions_revoke")
}
