package controller

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

// CUSTOM(brand): convert USD plan price_amount to Epay settlement currency using operation_setting.Price (matching topup.go:getPayMoney).
func getSubscriptionEpayPayMoney(priceAmountUSD float64) (decimal.Decimal, error) {
	if math.IsNaN(priceAmountUSD) || math.IsInf(priceAmountUSD, 0) || priceAmountUSD < 0.01 {
		return decimal.Zero, errors.New("plan amount is too low")
	}
	priceRatio := operation_setting.Price
	if math.IsNaN(priceRatio) || math.IsInf(priceRatio, 0) || priceRatio <= 0 {
		return decimal.Zero, errors.New("payment price ratio is invalid")
	}
	payMoney := decimal.NewFromFloat(priceAmountUSD).Mul(decimal.NewFromFloat(priceRatio)).Round(2)
	if payMoney.LessThan(decimal.NewFromFloat(0.01)) {
		return decimal.Zero, errors.New("plan amount is too low")
	}
	return payMoney, nil
}

// CUSTOM(brand): verify Epay callback settlement amount matches the immutable SubscriptionOrder.Money before granting quota.
func verifySubscriptionEpayMoney(tradeNo string, paidMoneyStr string) error {
	order := model.GetSubscriptionOrderByTradeNo(tradeNo)
	if order == nil {
		return model.ErrSubscriptionOrderNotFound
	}
	if order.PaymentProvider != model.PaymentProviderEpay {
		return model.ErrPaymentMethodMismatch
	}
	paidMoney, err := decimal.NewFromString(strings.TrimSpace(paidMoneyStr))
	if err != nil || !paidMoney.IsPositive() {
		return fmt.Errorf("invalid callback money: %q", paidMoneyStr)
	}
	expected := decimal.NewFromFloat(order.Money).Round(2)
	if !paidMoney.Equal(expected) {
		return fmt.Errorf("callback money mismatch: expected=%s got=%s", expected.StringFixed(2), paidMoney.String())
	}
	return nil
}

type SubscriptionEpayPayRequest struct {
	PlanId        int    `json:"plan_id"`
	PaymentMethod string `json:"payment_method"`
}

func SubscriptionRequestEpay(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}

	var req SubscriptionEpayPayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PlanId <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}

	plan, err := model.GetSubscriptionPlanById(req.PlanId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !plan.Enabled {
		common.ApiErrorT(c, "Subscription plan is not enabled")
		return
	}
	// CUSTOM(brand): compute Epay settlement amount via operation_setting.Price (USD -> fiat)
	payMoney, err := getSubscriptionEpayPayMoney(plan.PriceAmount)
	if err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("Subscription Epay rejected invalid price plan_id=%d price_amount=%.6f price_ratio=%.6f error=%q", plan.Id, plan.PriceAmount, operation_setting.Price, err.Error()))
		if operation_setting.Price <= 0 {
			common.ApiErrorT(c, "Payment information has not been configured by administrator")
		} else {
			common.ApiErrorT(c, "Plan amount is too low")
		}
		return
	}
	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		common.ApiErrorT(c, "Payment method does not exist")
		return
	}

	userId := c.GetInt("id")
	if plan.MaxPurchasePerUser > 0 {
		count, err := model.CountUserSubscriptionsByPlan(userId, plan.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if count >= int64(plan.MaxPurchasePerUser) {
			common.ApiErrorT(c, "Purchase limit for this plan has been reached")
			return
		}
	}

	callBackAddress := service.GetCallbackAddress()
	returnUrl, err := url.Parse(callBackAddress + "/api/subscription/epay/return")
	if err != nil {
		common.ApiErrorT(c, "Callback URL configuration error")
		return
	}
	notifyUrl, err := url.Parse(callBackAddress + "/api/subscription/epay/notify")
	if err != nil {
		common.ApiErrorT(c, "Callback URL configuration error")
		return
	}

	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	tradeNo = fmt.Sprintf("SUBUSR%dNO%s", userId, tradeNo)

	client := GetEpayClient()
	if client == nil {
		common.ApiErrorT(c, "Payment information has not been configured by administrator")
		return
	}

	order := &model.SubscriptionOrder{
		UserId:          userId,
		PlanId:          plan.Id,
		Money:           payMoney.InexactFloat64(), // CUSTOM(brand): store charged fiat amount (matches model.TopUp.Money)
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := order.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("Subscription Epay failed to create order user_id=%d plan_id=%d trade_no=%s error=%q", userId, plan.Id, tradeNo, err.Error()))
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("SUB:%s", plan.Title),
		Money:          payMoney.StringFixed(2), // CUSTOM(brand): send converted fiat amount instead of raw USD
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		logger.LogError(c.Request.Context(), common.LogText("Subscription Epay failed to start payment user_id=%d plan_id=%d trade_no=%s money=%s error=%q", userId, plan.Id, tradeNo, payMoney.StringFixed(2), err.Error()))
		_ = model.ExpireSubscriptionOrder(tradeNo, model.PaymentProviderEpay)
		common.ApiErrorT(c, "Failed to start payment")
		return
	}
	logger.LogInfo(c.Request.Context(), common.LogText("Subscription Epay order created user_id=%d plan_id=%d trade_no=%s payment_method=%s money=%s", userId, plan.Id, tradeNo, req.PaymentMethod, payMoney.StringFixed(2)))
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": params, "url": uri})
}

func SubscriptionEpayNotify(c *gin.Context) {
	// CUSTOM(brand): gate subscription Epay webhook on compliance & gateway availability (matches topup.go:EpayNotify)
	if !isEpayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), common.LogText("Subscription Epay webhook rejected reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	var params map[string]string

	if c.Request.Method == "POST" {
		// POST 请求：从 POST body 解析参数
		if err := c.Request.ParseForm(); err != nil {
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		// GET 请求：从 URL Query 解析参数
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}

	if len(params) == 0 {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	client := GetEpayClient()
	if client == nil {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	if verifyInfo.TradeStatus != epay.StatusTradeSuccess {
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	LockOrder(verifyInfo.ServiceTradeNo)
	defer UnlockOrder(verifyInfo.ServiceTradeNo)

	// CUSTOM(brand): verify callback settlement amount matches order.Money before completing subscription
	if err := verifySubscriptionEpayMoney(verifyInfo.ServiceTradeNo, verifyInfo.Money); err != nil {
		logger.LogWarn(c.Request.Context(), common.LogText("Subscription Epay notify rejected trade_no=%s money=%q client_ip=%s error=%q", verifyInfo.ServiceTradeNo, verifyInfo.Money, c.ClientIP(), err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	if err := model.CompleteSubscriptionOrder(verifyInfo.ServiceTradeNo, common.GetJsonString(verifyInfo), model.PaymentProviderEpay, verifyInfo.Type); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("Subscription Epay notify completion failed trade_no=%s client_ip=%s error=%q", verifyInfo.ServiceTradeNo, c.ClientIP(), err.Error()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	logger.LogInfo(c.Request.Context(), common.LogText("Subscription Epay notify completed trade_no=%s money=%q callback_type=%s client_ip=%s", verifyInfo.ServiceTradeNo, verifyInfo.Money, verifyInfo.Type, c.ClientIP()))
	_, _ = c.Writer.Write([]byte("success"))
}

// SubscriptionEpayReturn handles browser return after payment.
// It verifies the payload and completes the order, then redirects to console.
func SubscriptionEpayReturn(c *gin.Context) {
	// CUSTOM(brand): gate subscription Epay return on compliance & gateway availability
	if !isEpayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), common.LogText("Subscription Epay return rejected reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
		return
	}

	var params map[string]string

	if c.Request.Method == "POST" {
		// POST 请求：从 POST body 解析参数
		if err := c.Request.ParseForm(); err != nil {
			c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		// GET 请求：从 URL Query 解析参数
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}

	if len(params) == 0 {
		c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
		return
	}

	client := GetEpayClient()
	if client == nil {
		c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
		return
	}
	verifyInfo, err := client.Verify(params)
	if err != nil || !verifyInfo.VerifyStatus {
		c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
		return
	}
	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		LockOrder(verifyInfo.ServiceTradeNo)
		defer UnlockOrder(verifyInfo.ServiceTradeNo)
		// CUSTOM(brand): verify callback settlement amount matches order.Money before completing subscription
		if err := verifySubscriptionEpayMoney(verifyInfo.ServiceTradeNo, verifyInfo.Money); err != nil {
			logger.LogWarn(c.Request.Context(), common.LogText("Subscription Epay return rejected trade_no=%s money=%q client_ip=%s error=%q", verifyInfo.ServiceTradeNo, verifyInfo.Money, c.ClientIP(), err.Error()))
			c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
			return
		}
		if err := model.CompleteSubscriptionOrder(verifyInfo.ServiceTradeNo, common.GetJsonString(verifyInfo), model.PaymentProviderEpay, verifyInfo.Type); err != nil {
			logger.LogError(c.Request.Context(), common.LogText("Subscription Epay return completion failed trade_no=%s client_ip=%s error=%q", verifyInfo.ServiceTradeNo, c.ClientIP(), err.Error()))
			c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=fail"))
			return
		}
		logger.LogInfo(c.Request.Context(), common.LogText("Subscription Epay return completed trade_no=%s money=%q callback_type=%s client_ip=%s", verifyInfo.ServiceTradeNo, verifyInfo.Money, verifyInfo.Type, c.ClientIP()))
		c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=success"))
		return
	}
	c.Redirect(http.StatusFound, paymentReturnPath("/wallet?pay=pending"))
}
