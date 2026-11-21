package controller

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetSubscriptionEpayPayMoney(t *testing.T) {
	origPrice := operation_setting.Price
	t.Cleanup(func() {
		operation_setting.Price = origPrice
	})

	operation_setting.Price = 7.3
	cases := []struct {
		name     string
		usd      float64
		expected string
	}{
		{name: "Starter ¥19.90", usd: 2.726027, expected: "19.90"},
		{name: "Plus ¥99.00", usd: 13.561644, expected: "99.00"},
		{name: "Pro ¥299.00", usd: 40.958904, expected: "299.00"},
		{name: "Max ¥699.00", usd: 95.753425, expected: "699.00"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := getSubscriptionEpayPayMoney(tc.usd)
			require.NoError(t, err)
			assert.Equal(t, tc.expected, got.StringFixed(2))
		})
	}

	operation_setting.Price = 1.0
	got, err := getSubscriptionEpayPayMoney(19.99)
	require.NoError(t, err)
	assert.Equal(t, "19.99", got.StringFixed(2))

	for _, bad := range []float64{0, -1, 0.001, math.NaN(), math.Inf(1)} {
		_, err := getSubscriptionEpayPayMoney(bad)
		assert.Error(t, err)
	}

	operation_setting.Price = 0
	_, err = getSubscriptionEpayPayMoney(10)
	assert.Error(t, err)
}

func TestSubscriptionEpayEndToEndCurrencyAndAmountVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)
	confirmPaymentComplianceForTest(t)

	origDB := model.DB
	origLOGDB := model.LOG_DB
	origRedisEnabled := common.RedisEnabled
	origPrice := operation_setting.Price
	origPayAddress := operation_setting.PayAddress
	origEpayID := operation_setting.EpayId
	origEpayKey := operation_setting.EpayKey
	origPayMethods := operation_setting.PayMethods
	origServerAddress := system_setting.ServerAddress
	paymentSetting := operation_setting.GetPaymentSetting()
	origSignType := paymentSetting.EpaySignType

	t.Cleanup(func() {
		model.DB = origDB
		model.LOG_DB = origLOGDB
		common.RedisEnabled = origRedisEnabled
		operation_setting.Price = origPrice
		operation_setting.PayAddress = origPayAddress
		operation_setting.EpayId = origEpayID
		operation_setting.EpayKey = origEpayKey
		operation_setting.PayMethods = origPayMethods
		system_setting.ServerAddress = origServerAddress
		paymentSetting.EpaySignType = origSignType
	})
	common.RedisEnabled = false

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.SubscriptionPlan{},
		&model.SubscriptionOrder{},
		&model.UserSubscription{},
		&model.TopUp{},
		&model.Log{},
	))
	model.DB = db
	model.LOG_DB = db

	operation_setting.Price = 7.3
	operation_setting.PayAddress = "https://pay.example.com"
	operation_setting.EpayId = "epay_bozzii_test"
	operation_setting.EpayKey = "epay_secret_key"
	paymentSetting.EpaySignType = operation_setting.EpaySignTypeMD5
	operation_setting.PayMethods = []map[string]string{
		{"name": "微信", "type": "wxpay", "min_topup": "10"},
	}
	system_setting.ServerAddress = "https://ai.bozzii.com"

	user := &model.User{
		Username: "tester",
		Status:   common.UserStatusEnabled,
		Group:    "default",
	}
	require.NoError(t, db.Create(user).Error)

	allowTrue := true
	plan := &model.SubscriptionPlan{
		Title:               "Starter · 体验版",
		PriceAmount:         2.726027,
		Currency:            "USD",
		TotalAmount:         1780822,
		DurationUnit:        model.SubscriptionDurationMonth,
		DurationValue:       1,
		QuotaResetPeriod:    model.SubscriptionResetNever,
		MaxPurchasePerUser:  1,
		AllowBalancePay:     &allowTrue,
		AllowWalletOverflow: &allowTrue,
		Enabled:             true,
	}
	require.NoError(t, db.Create(plan).Error)

	router := gin.New()
	router.POST("/api/subscription/epay/pay", func(c *gin.Context) {
		c.Set("id", user.Id)
		SubscriptionRequestEpay(c)
	})
	router.POST("/api/subscription/epay/notify", SubscriptionEpayNotify)
	router.GET("/api/subscription/epay/return", SubscriptionEpayReturn)

	// 1. Create order: must convert $2.726027 * 7.3 -> "19.90" CNY (not "2.73")
	bodyBytes, err := json.Marshal(SubscriptionEpayPayRequest{
		PlanId:        plan.Id,
		PaymentMethod: "wxpay",
	})
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/api/subscription/epay/pay", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var payResp struct {
		Message string            `json:"message"`
		URL     string            `json:"url"`
		Data    map[string]string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payResp))
	assert.Equal(t, "success", payResp.Message)
	assert.Equal(t, "19.90", payResp.Data["money"])
	tradeNo := payResp.Data["out_trade_no"]
	require.NotEmpty(t, tradeNo)

	storedOrder := model.GetSubscriptionOrderByTradeNo(tradeNo)
	require.NotNil(t, storedOrder)
	assert.InDelta(t, 19.90, storedOrder.Money, 0.0001)
	assert.Equal(t, common.TopUpStatusPending, storedOrder.Status)

	client := GetEpayClient()
	require.NotNil(t, client)

	postNotify := func(fields map[string]string) string {
		signed, signErr := client.SignParams(fields)
		require.NoError(t, signErr)
		form := url.Values{}
		for k, v := range signed {
			form.Set(k, v)
		}
		nReq := httptest.NewRequest(http.MethodPost, "/api/subscription/epay/notify", strings.NewReader(form.Encode()))
		nReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		nRec := httptest.NewRecorder()
		router.ServeHTTP(nRec, nReq)
		return nRec.Body.String()
	}

	// 2. Reject validly signed underpayment ("2.73") and fractional-cent ("19.895")
	for _, badMoney := range []string{"2.73", "19.895"} {
		assert.Equal(t, "fail", postNotify(map[string]string{
			"type":         "wxpay",
			"money":        badMoney,
			"name":         "SUB:Starter",
			"out_trade_no": tradeNo,
			"trade_status": epay.StatusTradeSuccess,
		}))
	}
	// Also verify GET /api/subscription/epay/return rejects mismatched money with /wallet?pay=fail
	badReturnParams, err := client.SignParams(map[string]string{
		"type":         "wxpay",
		"money":        "2.73",
		"name":         "SUB:Starter",
		"out_trade_no": tradeNo,
		"trade_status": epay.StatusTradeSuccess,
	})
	require.NoError(t, err)
	badQ := url.Values{}
	for k, v := range badReturnParams {
		badQ.Set(k, v)
	}
	badRetRec := httptest.NewRecorder()
	router.ServeHTTP(badRetRec, httptest.NewRequest(http.MethodGet, "/api/subscription/epay/return?"+badQ.Encode(), nil))
	assert.Equal(t, http.StatusFound, badRetRec.Code)
	assert.Equal(t, "https://ai.bozzii.com/wallet?pay=fail", badRetRec.Header().Get("Location"))

	var subCount int64
	require.NoError(t, db.Model(&model.UserSubscription{}).Count(&subCount).Error)
	assert.Equal(t, int64(0), subCount)

	// 3. Reject when webhook is disabled (empty PayMethods)
	savedMethods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	assert.Equal(t, "fail", postNotify(map[string]string{
		"type":         "wxpay",
		"money":        "19.90",
		"name":         "SUB:Starter",
		"out_trade_no": tradeNo,
		"trade_status": epay.StatusTradeSuccess,
	}))
	operation_setting.PayMethods = savedMethods

	// 4. Accept validly signed exact amount ("19.90")
	assert.Equal(t, "success", postNotify(map[string]string{
		"type":         "wxpay",
		"money":        "19.90",
		"name":         "SUB:Starter",
		"out_trade_no": tradeNo,
		"trade_status": epay.StatusTradeSuccess,
	}))
	require.NoError(t, db.Model(&model.UserSubscription{}).Count(&subCount).Error)
	assert.Equal(t, int64(1), subCount)

	completedOrder := model.GetSubscriptionOrderByTradeNo(tradeNo)
	require.NotNil(t, completedOrder)
	assert.Equal(t, common.TopUpStatusSuccess, completedOrder.Status)

	var topup model.TopUp
	require.NoError(t, db.Where("trade_no = ?", tradeNo).First(&topup).Error)
	assert.InDelta(t, 19.90, topup.Money, 0.0001)

	// 5. Duplicate callback & browser return stay idempotent
	assert.Equal(t, "success", postNotify(map[string]string{
		"type":         "wxpay",
		"money":        "19.90",
		"name":         "SUB:Starter",
		"out_trade_no": tradeNo,
		"trade_status": epay.StatusTradeSuccess,
	}))
	okReturnParams, err := client.SignParams(map[string]string{
		"type":         "wxpay",
		"money":        "19.9",
		"name":         "SUB:Starter",
		"out_trade_no": tradeNo,
		"trade_status": epay.StatusTradeSuccess,
	})
	require.NoError(t, err)
	okQ := url.Values{}
	for k, v := range okReturnParams {
		okQ.Set(k, v)
	}
	okRetRec := httptest.NewRecorder()
	router.ServeHTTP(okRetRec, httptest.NewRequest(http.MethodGet, "/api/subscription/epay/return?"+okQ.Encode(), nil))
	assert.Equal(t, http.StatusFound, okRetRec.Code)
	assert.Equal(t, "https://ai.bozzii.com/wallet?pay=success", okRetRec.Header().Get("Location"))

	require.NoError(t, db.Model(&model.UserSubscription{}).Count(&subCount).Error)
	assert.Equal(t, int64(1), subCount)
}
