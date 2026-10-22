const firebaseConfig = {
  apiKey: "AIzaSyCewAWzj09CsJWJRqZ16TmWN6Z-d0ATyaM",
  authDomain: "kumar-loot.firebaseapp.com",
  databaseURL: "https://kumar-loot-default-rtdb.firebaseio.com",
  projectId: "kumar-loot",
  storageBucket: "kumar-loot.firebasestorage.app",
  messagingSenderId: "264932703737",
  appId: "1:264932703737:web:2cc50a8bbe1923917b5128"
};

// Server Memory Database (Firebase Rules बंद असतील तरी १००% अचूक काम करेल)
const globalStore = globalThis.__VERIFY_STORE__ || (globalThis.__VERIFY_STORE__ = {
  devices: new Map(),
  users: new Map()
});

async function fbGet(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // जर Firebase ने error दिला किंवा first_userid नसेल तर null परत करा
    if (!data || typeof data !== "object" || data.error) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function fbPut(url, payload) {
  try {
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const DB_URL = firebaseConfig.databaseURL;

  // ==========================================================
  // 1. GET Request: Telegram Bot कडून Status Check
  // ==========================================================
  if (req.method === "GET") {
    const query = req.query || {};
    const userid = query.userid ? String(query.userid).trim() : "";
    const bot = (query.bot || "Kumar_api_bot").toLowerCase().replace("@", "").trim();

    if (!userid) {
      return res.status(200).json({
        ok: true,
        status: "ready",
        message: "Verification API is live and running."
      });
    }

    const userKey = `${bot}_${userid}`;
    let userData = await fbGet(`${DB_URL}/v3_shield/${bot}/users/${userid}.json`);
    if (!userData || !userData.status) {
      userData = globalStore.users.get(userKey) || null;
    }

    // जर चुकून जुन्या डेटामध्ये सेम युजर बॅन दिसत असेल तर त्याला Verified करा
    if (userData && userData.status === "banned" && String(userData.first_userid) === String(userData.current_userid)) {
      userData = {
        ok: true,
        code: 200,
        status: "already_verified",
        verified: true,
        banned: false,
        access: "ALREADY VERIFIED ✅",
        bot: bot,
        userid: userid,
        deviceId: userData.deviceId || "DEV-VERIFIED",
        accounts_count: 1,
        message: "Already Verified ✅! Your account is verified on this device."
      };
    }

    if (!userData) {
      return res.status(200).json({
        ok: false,
        code: 404,
        status: "pending",
        verified: false,
        banned: false,
        bot: bot,
        userid: userid,
        message: "User has not verified their device yet ⏳"
      });
    }

    return res.status(200).json(userData);
  }

  // ==========================================================
  // 2. POST Request: Mini App मधून Device Verification
  // ==========================================================
  if (req.method === "POST") {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const userid = body.userid ? String(body.userid).trim() : "";
    const bot = (body.bot || "Kumar_api_bot").toLowerCase().replace("@", "").trim();
    const deviceId = body.deviceId ? String(body.deviceId).trim() : "";
    const rawPrev = body.previousUser ? String(body.previousUser).trim() : "";
    const previousUser = (rawPrev && rawPrev !== "null" && rawPrev !== "undefined") ? rawPrev : "";

    if (!userid || !deviceId) {
      return res.status(400).json({
        ok: false,
        status: "error",
        message: "Missing userid or deviceId"
      });
    }

    const devKey = `${bot}_${deviceId}`;
    const userKey = `${bot}_${userid}`;
    const deviceUrl = `${DB_URL}/v3_shield/${bot}/devices/${deviceId}.json`;
    const userUrl = `${DB_URL}/v3_shield/${bot}/users/${userid}.json`;

    let deviceData = await fbGet(deviceUrl);
    if (!deviceData || !deviceData.first_userid) {
      deviceData = globalStore.devices.get(devKey) || null;
    }

    // मूळ पहिला युजर कोण होता ते काढा
    let firstUid = "";
    if (deviceData && deviceData.first_userid && deviceData.first_userid !== "undefined") {
      firstUid = String(deviceData.first_userid).trim();
    } else if (previousUser) {
      firstUid = previousUser;
    }

    // ----------------------------------------------------------
    // CASE 1: जर या डिव्हाइसवर आधीच दुसरा वेगळा युजर होता (firstUid !== userid)
    // फक्त तेव्हाच DIRECT BANNED 🚫 करा!
    // ----------------------------------------------------------
    if (firstUid && firstUid !== userid) {
      const banResponse = {
        ok: false,
        code: 403,
        status: "banned",
        verified: false,
        banned: true,
        access: "DENIED 🚫",
        reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        bot: bot,
        first_userid: firstUid,
        current_userid: userid,
        deviceId: deviceId,
        accounts_count: 2,
        message: "Direct Banned 🚫! 2 different accounts used on the same device."
      };

      globalStore.devices.set(devKey, {
        first_userid: firstUid,
        second_userid: userid,
        banned: true
      });
      globalStore.users.set(userKey, banResponse);
      globalStore.users.set(`${bot}_${firstUid}`, banResponse);

      await fbPut(deviceUrl, {
        first_userid: firstUid,
        second_userid: userid,
        banned: true
      });
      await fbPut(userUrl, banResponse);
      await fbPut(`${DB_URL}/v3_shield/${bot}/users/${firstUid}.json`, banResponse);

      return res.status(200).json(banResponse);
    }

    // जर डिव्हाइसवर आधीच २ वेगवेगळे युजर असल्यामुळे बॅन लागला असेल
    if (
      deviceData &&
      deviceData.banned === true &&
      deviceData.second_userid &&
      String(deviceData.second_userid).trim() !== firstUid
    ) {
      const secondUid = String(deviceData.second_userid).trim();
      const banResponse = {
        ok: false,
        code: 403,
        status: "banned",
        verified: false,
        banned: true,
        access: "DENIED 🚫",
        reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        bot: bot,
        first_userid: firstUid,
        current_userid: secondUid,
        deviceId: deviceId,
        accounts_count: 2,
        message: "Direct Banned 🚫! 2 different accounts used on the same device."
      };

      globalStore.users.set(userKey, banResponse);
      return res.status(200).json(banResponse);
    }

    // ----------------------------------------------------------
    // CASE 2: जर तोच युजर पुन्हा आला असेल (firstUid === userid)
    // तर ALREADY VERIFIED ✅ दाखवा (कधीही Ban करू नका!)
    // ----------------------------------------------------------
    if (firstUid && firstUid === userid) {
      const alreadyResponse = {
        ok: true,
        code: 200,
        status: "already_verified",
        verified: true,
        banned: false,
        access: "ALREADY VERIFIED ✅",
        bot: bot,
        userid: userid,
        deviceId: deviceId,
        accounts_count: 1,
        message: "Already Verified ✅! Your account is already verified on this device."
      };

      globalStore.devices.set(devKey, { first_userid: userid, banned: false });
      globalStore.users.set(userKey, alreadyResponse);

      await fbPut(deviceUrl, { first_userid: userid, banned: false });
      await fbPut(userUrl, alreadyResponse);

      return res.status(200).json(alreadyResponse);
    }

    // ----------------------------------------------------------
    // CASE 3: जर युजर पहिल्यांदाच व्हेरिफाय करत असेल -> VERIFIED ✅
    // ----------------------------------------------------------
    const successResponse = {
      ok: true,
      code: 200,
      status: "verified",
      verified: true,
      banned: false,
      access: "GRANTED ✅",
      bot: bot,
      userid: userid,
      deviceId: deviceId,
      accounts_count: 1,
      message: "Verification Successful ✅! First account locked to this device."
    };

    globalStore.devices.set(devKey, { first_userid: userid, banned: false });
    globalStore.users.set(userKey, successResponse);

    await fbPut(deviceUrl, { first_userid: userid, banned: false });
    await fbPut(userUrl, successResponse);

    return res.status(200).json(successResponse);
  }

  return res.status(405).json({ ok: false, message: "Method Not Allowed" });
};
