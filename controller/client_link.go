package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// The device headers are written by the guide text in service/client_link_guide.go.
func clientLinkDevice(c *gin.Context) service.Device {
	return service.Device{OS: c.GetHeader("X-Client-Os"), WB: c.GetHeader("X-Client-Wb"), HW: c.GetHeader("X-Client-Hw")}
}

// clientLinkDenied answers every failure the same way so a caller cannot tell
// an unknown code from an expired, used or disabled one.
func clientLinkDenied(c *gin.Context, err error) {
	if !errors.Is(err, service.ErrClientLinkUnavailable) {
		common.SysLog(common.LogText("client link request failed: %s", err.Error()))
	}
	// shortcut: zh-only text, read by the AI client and echoed to a Chinese-speaking user.
	c.String(http.StatusNotFound, "链接无效或已过期，请回到网页重新复制提示词。")
}

// ClientLinkGuide serves the steps an AI client follows. It consumes nothing.
func ClientLinkGuide(c *gin.Context) {
	guide, err := service.ClientLinkGuide(c.Query("t"), service.ClientLinkBase(), c.Param("code"))
	if err != nil {
		clientLinkDenied(c, err)
		return
	}
	c.String(http.StatusOK, guide)
}

// ClientLinkExchange trades a link code for a one-time download code.
func ClientLinkExchange(c *gin.Context) {
	dl, err := service.ExchangeClientLink(c.Param("code"), c.Query("t"), clientLinkDevice(c))
	if err != nil {
		clientLinkDenied(c, err)
		return
	}
	c.String(http.StatusOK, dl)
}

// ClientLinkRedeem returns the config file once per download code.
func ClientLinkRedeem(c *gin.Context) {
	body, err := service.RedeemClientLink(c.Param("dl"), c.Param("file"), clientLinkDevice(c))
	if err != nil {
		clientLinkDenied(c, err)
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// GetClientLinkOptions tells the page which targets and sharing are available.
func GetClientLinkOptions(c *gin.Context) {
	setting := operation_setting.GetClientLinkSetting()
	common.ApiSuccess(c, gin.H{
		"enabled":         setting.Enabled,
		"share_enabled":   setting.Enabled && setting.AnonymousEnabled,
		"workbuddy_ready": service.ClientLinkTargetReady("workbuddy"),
		"dsh_ready":       service.ClientLinkTargetReady("dsh"),
		"server_address":  service.ClientLinkBase(),
	})
}

type clientLinkRequest struct {
	Target string `json:"target"`
	Share  bool   `json:"share"`
}

// CreateClientLink returns a link for the signed-in user, or their share link.
func CreateClientLink(c *gin.Context) {
	var req clientLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil || !service.ClientLinkTargetReady(req.Target) {
		common.ApiErrorT(c, "Client link is not available")
		return
	}
	create := service.NewClientLink
	if req.Share {
		create = service.ShareClientLink
	}
	code, err := create(c.GetInt("id"))
	if err != nil {
		common.ApiErrorT(c, "Client link is not available")
		return
	}
	base := service.ClientLinkBase()
	common.ApiSuccess(c, gin.H{
		"code":        code,
		"guide_url":   base + "/c/" + code + "?t=" + req.Target,
		"landing_url": base + "/s/" + code + "?t=" + req.Target,
	})
}

// DownloadClientConfig lets a signed-in user download the config file directly.
func DownloadClientConfig(c *gin.Context) {
	target := c.Query("target")
	body, err := service.ClientConfigBody(c.GetInt("id"), target)
	if err != nil {
		common.ApiErrorT(c, "Client link is not available")
		return
	}
	file := "models.json"
	if target == "dsh" {
		file = "dsh.json"
	}
	c.Header("Content-Disposition", `attachment; filename="`+file+`"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// ClientLinkInstallSh serves the macOS one-step installer. It consumes nothing.
func ClientLinkInstallSh(c *gin.Context) {
	script, err := service.ClientLinkInstallScript("workbuddy", service.ClientLinkBase(), c.Param("code"))
	if err != nil {
		clientLinkDenied(c, err)
		return
	}
	c.Data(http.StatusOK, "text/x-shellscript; charset=utf-8", []byte(script))
}

// ClientLinkInstallPs1 serves the Windows PowerShell installer. It consumes nothing.
func ClientLinkInstallPs1(c *gin.Context) {
	script, err := service.ClientLinkInstallScriptPS1(service.ClientLinkBase(), c.Param("code"))
	if err != nil {
		clientLinkDenied(c, err)
		return
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(script))
}
