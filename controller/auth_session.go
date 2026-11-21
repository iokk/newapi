package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func RefreshAuth(c *gin.Context) {
	setAuthNoStore(c)
	rawRefreshToken, err := c.Cookie(service.RefreshCookieName)
	if err != nil || rawRefreshToken == "" {
		service.ClearRefreshCookie(c)
		writeAuthSessionError(c, service.ErrRefreshTokenInvalid)
		return
	}
	bundle, user, err := service.RefreshLoginSession(rawRefreshToken, c.GetHeader("X-Auth-Session"), c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		if errors.Is(err, service.ErrRefreshTokenInvalid) || errors.Is(err, service.ErrLoginSessionRevoked) {
			service.ClearRefreshCookie(c)
		}
		writeAuthSessionError(c, err)
		return
	}
	service.WriteRefreshCookie(c, bundle.RefreshToken)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"access_token":      bundle.AccessToken,
			"token_type":        bundle.TokenType,
			"access_expires_at": bundle.AccessExpiresAt,
			"user":              buildSelfUserData(user),
			"session":           bundle.Session,
		},
	})
}

func AuthLogout(c *gin.Context) {
	setAuthNoStore(c)
	expectedSID := strings.TrimSpace(c.GetHeader("X-Auth-Session"))
	rawRefreshToken, cookieErr := c.Cookie(service.RefreshCookieName)
	cookieSID, hasCookieSID := service.RefreshTokenSID(rawRefreshToken)
	if expectedSID != "" && cookieErr == nil && hasCookieSID && cookieSID != expectedSID {
		writeAuthSessionError(c, service.ErrLoginSessionMismatch)
		return
	}

	if rawAccessToken, ok := dashboardBearer(c.GetHeader("Authorization")); ok {
		if identity, err := service.ParseAccessToken(rawAccessToken); err == nil {
			if expectedSID != "" && expectedSID != identity.SessionID {
				writeAuthSessionError(c, service.ErrLoginSessionMismatch)
				return
			}
			if _, err := model.RevokeUserSession(identity.UserID, identity.SessionID, "logout"); err != nil {
				writeAuthSessionError(c, err)
				return
			}
			// CUSTOM(brand): audit active user logout
			recordLogoutAudit(c, identity.UserID, identity.SessionID)
			cookieCleared := false
			if cookieErr == nil && hasCookieSID && cookieSID == identity.SessionID {
				if err := service.RevokeByRefreshToken(rawRefreshToken, identity.SessionID, "logout"); err != nil {
					writeAuthSessionError(c, err)
					return
				}
				service.ClearRefreshCookie(c)
				cookieCleared = true
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "",
				"data":    gin.H{"revoked_sid": identity.SessionID, "cookie_cleared": cookieCleared},
			})
			return
		}
	}
	if cookieErr != nil || rawRefreshToken == "" {
		service.ClearRefreshCookie(c)
		c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
		return
	}
	if err := service.RevokeByRefreshToken(rawRefreshToken, expectedSID, "logout"); err != nil {
		writeAuthSessionError(c, err)
		return
	}
	service.ClearRefreshCookie(c)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func GetLoginSessions(c *gin.Context) {
	identity, ok := requireBrowserSession(c)
	if !ok {
		return
	}
	sessions, err := service.ListLoginSessions(identity.UserID, identity.SessionID)
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": sessions})
}

func DeleteLoginSession(c *gin.Context) {
	identity, ok := requireBrowserSession(c)
	if !ok {
		return
	}
	sid := strings.TrimSpace(c.Param("sid"))
	if sid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "AUTH_SESSION_ID_REQUIRED", "message": "session id is required"})
		return
	}
	revoked, err := model.RevokeUserSession(identity.UserID, sid, "user_revoked")
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	if !revoked {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "code": "AUTH_SESSION_NOT_FOUND", "message": "session not found"})
		return
	}
	if rawRefreshToken, cookieErr := c.Cookie(service.RefreshCookieName); cookieErr == nil {
		cookieSID, ok := service.RefreshTokenSID(rawRefreshToken)
		if ok && cookieSID == sid {
			service.ClearRefreshCookie(c)
		}
	}
	// CUSTOM(brand): audit self session revocation
	recordUserSecurityAudit(c, identity.UserID, "session.revoke", map[string]any{"sid": sid})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"revoked_sid": sid, "current": sid == identity.SessionID}})
}

func RevokeOtherLoginSessions(c *gin.Context) {
	identity, ok := requireBrowserSession(c)
	if !ok {
		return
	}
	count, err := model.RevokeOtherUserSessions(identity.UserID, identity.SessionID, "user_revoked_others")
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	// CUSTOM(brand): audit revoking all other sessions
	recordUserSecurityAudit(c, identity.UserID, "session.revoke_others", map[string]any{"count": count})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"revoked_count": count}})
}

// CUSTOM(brand): recordLogoutAudit records explicit logout events in login audit logs.
func recordLogoutAudit(c *gin.Context, userID int, sid string) {
	if userID <= 0 {
		return
	}
	user, err := model.GetUserById(userID, false)
	actorRole := common.RoleCommonUser
	username := ""
	if err == nil && user != nil {
		actorRole = user.Role
		username = user.Username
	}
	ip, ua := "", ""
	if c != nil && c.Request != nil {
		ip = c.ClientIP()
		ua = c.Request.UserAgent()
	}
	extra := model.AuditOther{
		UserAgent: ua,
	}
	model.RecordLoginEvent(userID, actorRole, username, "Signed out", ip, "logout", true, http.StatusOK, map[string]any{"sid": sid}, extra, c)
}

// CUSTOM(brand): AdminGetUserSessions lists active login sessions for a target user.
func AdminGetUserSessions(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	myRole := c.GetInt("role")
	if c.GetInt("id") != user.Id && !canManageTargetRole(myRole, user.Role) {
		common.ApiErrorT(c, "No permission to access users of same or higher level")
		return
	}
	sessions, err := service.ListLoginSessions(user.Id, "")
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": sessions})
}

// CUSTOM(brand): AdminRevokeUserSessions force-revokes all active login sessions for a target user.
func AdminRevokeUserSessions(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, user.Role) {
		common.ApiErrorT(c, "No permission to access users of same or higher level")
		return
	}
	count, err := model.RevokeAllUserSessions(user.Id, "admin_revoked")
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	recordManageAuditFor(c, user.Id, "user.sessions_revoke", map[string]any{
		"username": user.Username,
		"count":    count,
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"revoked_count": count}})
}

func requireBrowserSession(c *gin.Context) (service.AuthIdentity, bool) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"code":    "AUTH_SESSION_REQUIRED",
			"message": "a dashboard login session is required",
		})
		return service.AuthIdentity{}, false
	}
	return identity, true
}

func writeAuthSessionError(c *gin.Context, err error) {
	status, code := service.AuthSessionErrorCode(err)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		status, code = http.StatusUnauthorized, "AUTH_UNAUTHORIZED"
	}
	if status == http.StatusInternalServerError {
		// The response body only carries the generic AUTH_INTERNAL_ERROR
		// code; without this log the underlying Redis/database/session
		// failure is indistinguishable from the client side.
		logger.LogError(c.Request.Context(), common.LogText("auth session internal error (%s %s): %v", c.Request.Method, c.Request.URL.Path, err))
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": http.StatusText(status)})
}

func setAuthNoStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
}

// authRotationData is empty when the change came through an access token,
// which has no browser session to rotate.
func authRotationData(bundle *service.AuthBundle) gin.H {
	if bundle == nil {
		return gin.H{}
	}
	return gin.H{
		"access_token":      bundle.AccessToken,
		"token_type":        bundle.TokenType,
		"access_expires_at": bundle.AccessExpiresAt,
		"session":           bundle.Session,
	}
}

func dashboardBearer(header string) (string, bool) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}
