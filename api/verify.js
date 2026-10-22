const firebaseConfig = {
  apiKey: "AIzaSyCewAWzj09CsJWJRqZ16TmWN6Z-d0ATyaM",
  authDomain: "kumar-loot.firebaseapp.com",
  databaseURL: "https://kumar-loot-default-rtdb.firebaseio.com",
  projectId: "kumar-loot",
  storageBucket: "kumar-loot.firebasestorage.app",
  messagingSenderId: "264932703737",
  appId: "1:264932703737:web:2cc50a8bbe1923917b5128"
};

const globalStore = globalThis.__VERIFY_V5_CLEAN__ || (globalThis.__VERIFY_V5_CLEAN__ = {
  devices: new Map(),
  users: new Map()
});

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
  // 1. GET Request: Bot kiva Browser kadun Status Check
  // ==========================================================
  if (req.method === "GET") {
    const query = req.query || {};
    const userid = query.userid ? String(query.userid).trim() : "";
    const bot = (query.bot || "Kumar_api_bot").toLowerCase().replace("@", "").trim();

    if (!userid) {
      return res.status(200).json({
        ok: true,
        status: "ready",
        verified_sample: {
          ok: true,
          code: 200,
          status: "verified",
          verified: true,
          banned: false,
          access: "GRANTED ✅",
          bot: "kumar_api_bot",
          userid: "7335163273",
          deviceId: "DEV-460FCEA5",
          accounts_count: 1,
          message: "Verification Successful ✅! First account locked to this device."
        },
        already_verified_sample: {
          ok: true,
          code: 200,
          status: "already_verified",
          verified: true,
          banned: false,
          access: "ALREADY VERIFIED ✅",
          bot: "kumar_api_bot",
          userid: "7335163273",
          deviceId: "DEV-460FCEA5",
          accounts_count: 1,
          message: "Already Verified ✅! Your primary account is verified on this device."
        },
        banned_sample: {
          ok: false,
          code: 403,
          status: "banned",
          verified: false,
          banned: true,
          access: "DENIED 🚫",
          reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
          bot: "kumar_api_bot",
          first_userid: "7335163273",
          current_userid: "8609907744",
          deviceId: "DEV-460FCEA5",
          accounts_count: 2,
          message: "Direct Banned 🚫! This device is already locked to 1st User (7335163273)."
        }
      });
    }

    const userKey = `${bot}_${userid}`;
    let userData = await fbGet(`${DB_URL}/v5_clean/${bot}/users/${userid}.json`);
    if (!userData || !userData.status) {
      userData = globalStore.users.get(userKey) || null;
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
  // 2. POST Request: Mini App madhun Device Verification
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
    const deviceUrl = `${DB_URL}/v5_clean/${bot}/devices/${deviceId}.json`;
    const userUrl = `${DB_URL}/v5_clean/${bot}/users/${userid}.json`;

    let deviceData = await fbGet(deviceUrl);
    if (!deviceData || !deviceData.first_userid) {
      deviceData = globalStore.devices.get(devKey) || null;
    }

    // Ya device cha 1st User (Owner) kon ahe te check kara
    let firstUid = "";
    if (deviceData && deviceData.first_userid && deviceData.first_userid !== "undefined") {
      firstUid = String(deviceData.first_userid).trim();
    } else if (previousUser) {
      firstUid = previousUser;
    }

    // ----------------------------------------------------------
    // CASE 1: Pahilach User ahe (Ajun device var konihi nahi) -> VERIFIED ✅
    // ----------------------------------------------------------
    if (!firstUid) {
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

      globalStore.devices.set(devKey, { first_userid: userid });
      globalStore.users.set(userKey, successResponse);

      await fbPut(deviceUrl, { first_userid: userid });
      await fbPut(userUrl, successResponse);

      return res.status(200).json(successResponse);
    }

    // ----------------------------------------------------------
    // CASE 2: Toch 1st User parat aala (firstUid === userid)
    // Tar to nehami ALREADY VERIFIED ✅ rahil (Kadhihi Ban honar nahi!)
    // ----------------------------------------------------------
    if (firstUid === userid) {
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
        message: "Already Verified ✅! Your primary account is verified on this device."
      };

      globalStore.devices.set(devKey, { first_userid: firstUid });
      globalStore.users.set(userKey, alreadyResponse);

      await fbPut(deviceUrl, { first_userid: firstUid });
      await fbPut(userUrl, alreadyResponse);

      return res.status(200).json(alreadyResponse);
    }

    // ----------------------------------------------------------
    // CASE 3: Dusra/Tisra vegla User ID aala (firstUid !== userid)
    // Fakt ya navin 2nd User lach DIRECT BANNED 🚫 kara! (1st User safe rahil)
    // ----------------------------------------------------------
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
      message: "Direct Banned 🚫! This device is already locked to 1st User (" + firstUid + ")."
    };

    // Fakt 2nd User chya account var Ban save kara, 1st User chya record la hat lavu naka!
    globalStore.users.set(userKey, banResponse);
    await fbPut(userUrl, banResponse);

    return res.status(200).json(banResponse);
  }

  return res.status(405).json({ ok: false, message: "Method Not Allowed" });
};
