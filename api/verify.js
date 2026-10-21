const firebaseConfig = {
  apiKey: "AIzaSyCewAWzj09CsJWJRqZ16TmWN6Z-d0ATyaM",
  authDomain: "kumar-loot.firebaseapp.com",
  databaseURL: "https://kumar-loot-default-rtdb.firebaseio.com",
  projectId: "kumar-loot",
  storageBucket: "kumar-loot.firebasestorage.app",
  messagingSenderId: "264932703737",
  appId: "1:264932703737:web:2cc50a8bbe1923917b5128"
};

const memoryDevices = new Map();
const memoryUsers = new Map();

async function fbGet(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
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
  // 1. GET Request: Bot kiva Browser kadun status check
  // ==========================================================
  if (req.method === "GET") {
    const query = req.query || {};
    const userid = query.userid ? String(query.userid).trim() : "";
    const bot = (query.bot || "kumarmakerbot").toLowerCase().replace("@", "").trim();

    if (!userid) {
      return res.status(200).json({
        ok: true,
        status: "ready",
        verified_response: {
          ok: true,
          code: 200,
          status: "verified",
          verified: true,
          banned: false,
          bot: "kumarmakerbot",
          userid: "7335163273",
          deviceId: "DEV-5109D533",
          message: "Verification Successful ✅"
        },
        already_verified_response: {
          ok: true,
          code: 200,
          status: "already_verified",
          verified: true,
          banned: false,
          bot: "kumarmakerbot",
          userid: "7335163273",
          deviceId: "DEV-5109D533",
          message: "Already Verified ✅! Your account is already verified on this device."
        },
        banned_response: {
          ok: false,
          code: 403,
          status: "banned",
          verified: false,
          banned: true,
          bot: "kumarmakerbot",
          first_userid: "7335163273",
          current_userid: "9988776655",
          deviceId: "DEV-5109D533",
          message: "Direct Banned 🚫! Multiple accounts used on the same device."
        }
      });
    }

    let userData = await fbGet(`${DB_URL}/v2_verify/${bot}/users/${userid}.json`);
    if (!userData) {
      userData = memoryUsers.get(`${bot}_${userid}`);
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
  // 2. POST Request: Website varun Device Verification
  // ==========================================================
  if (req.method === "POST") {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const userid = body.userid ? String(body.userid).trim() : "";
    const bot = (body.bot || "kumarmakerbot").toLowerCase().replace("@", "").trim();
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
    const deviceUrl = `${DB_URL}/v2_verify/${bot}/devices/${deviceId}.json`;
    const userUrl = `${DB_URL}/v2_verify/${bot}/users/${userid}.json`;

    let deviceData = await fbGet(deviceUrl);
    if (!deviceData || !deviceData.first_userid) {
      deviceData = memoryDevices.get(devKey) || null;
    }

    // Check: Jar ya device var adhich record asel
    if (deviceData && deviceData.first_userid) {
      const firstUid = String(deviceData.first_userid).trim();
      const secondUid = deviceData.second_userid ? String(deviceData.second_userid).trim() : "";

      // Case 1: Dusra vegla User ID aala (firstUid !== userid) kiva adhich 2 veglya IDs mule device ban zala ahe
      if (firstUid !== userid || (deviceData.banned === true && secondUid && secondUid !== firstUid)) {
        const blockedSecondUser = firstUid !== userid ? userid : secondUid;

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
          current_userid: blockedSecondUser,
          deviceId: deviceId,
          accounts_count: 2,
          message: "Direct Banned 🚫! Same device & same bot used with 2 different user IDs."
        };

        memoryDevices.set(devKey, {
          first_userid: firstUid,
          second_userid: blockedSecondUser,
          banned: true
        });
        memoryUsers.set(`${bot}_${userid}`, banResponse);
        memoryUsers.set(`${bot}_${firstUid}`, banResponse);

        await fbPut(deviceUrl, {
          first_userid: firstUid,
          second_userid: blockedSecondUser,
          banned: true
        });
        await fbPut(userUrl, banResponse);
        await fbPut(`${DB_URL}/v2_verify/${bot}/users/${firstUid}.json`, banResponse);

        return res.status(200).json(banResponse);
      }

      // Case 2: Toch User ID parat aala (firstUid === userid) -> ALREADY VERIFIED ✅
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

      memoryUsers.set(`${bot}_${userid}`, alreadyResponse);
      await fbPut(userUrl, alreadyResponse);

      return res.status(200).json(alreadyResponse);
    }

    // Check: Jar LocalStorage madhe vegla user save asel (previousUser !== userid)
    if (previousUser && previousUser !== userid) {
      const banResponse = {
        ok: false,
        code: 403,
        status: "banned",
        verified: false,
        banned: true,
        access: "DENIED 🚫",
        reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
        bot: bot,
        first_userid: previousUser,
        current_userid: userid,
        deviceId: deviceId,
        accounts_count: 2,
        message: "Direct Banned 🚫! Same device & same bot used with 2 different user IDs."
      };

      memoryDevices.set(devKey, {
        first_userid: previousUser,
        second_userid: userid,
        banned: true
      });
      memoryUsers.set(`${bot}_${userid}`, banResponse);
      memoryUsers.set(`${bot}_${previousUser}`, banResponse);

      await fbPut(deviceUrl, {
        first_userid: previousUser,
        second_userid: userid,
        banned: true
      });
      await fbPut(userUrl, banResponse);
      await fbPut(`${DB_URL}/v2_verify/${bot}/users/${previousUser}.json`, banResponse);

      return res.status(200).json(banResponse);
    }

    // Case 3: Pahilyandach Verification karat ahe -> VERIFIED SUCCESSFULLY ✅
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

    memoryDevices.set(devKey, {
      first_userid: userid,
      banned: false
    });
    memoryUsers.set(`${bot}_${userid}`, successResponse);

    await fbPut(deviceUrl, {
      first_userid: userid,
      banned: false
    });
    await fbPut(userUrl, successResponse);

    return res.status(200).json(successResponse);
  }

  return res.status(405).json({ ok: false, message: "Method Not Allowed" });
};
