/* ============================================================
   فنكشن سحابية واحدة بس: sendQueuedPush
   بتراقب /mr_alfaham_data/pushQueue في الـ Realtime Database، وكل
   مرة يتضاف عنصر جديد (التطبيق بيضيفه لما حدث مهم يحصل — حضور/بريك/
   تقييم... إلخ عن طريق queuePushNotification في index.html)، الفنكشن
   دي بتاخده وتبعته كـ push notification حقيقي عن طريق OneSignal REST
   API، وبعدين تمسح العنصر من الطابور.

   السبب في وجود الفنكشن دي أصلًا: مفتاح OneSignal REST API لازم
   يفضل سري تمامًا ومتظهرش في كود الموقع (index.html) اللي أي حد
   يقدر يفتحه من المتصفح ويشوفه — فبنحطه هنا بس، في مكان محدش يقدر
   يوصله غير حساب Firebase بتاعك.

   ============================================================
   خطوات النشر (تتعمل مرة واحدة بس):
   1) لو معندكش Firebase CLI: npm install -g firebase-tools
   2) firebase login
   3) من نفس فولدر المشروع (اللي فيه فولدر functions/ ده):
      firebase use mr-aalfahm
   4) خزّن مفتاح OneSignal REST API (من نفس صفحة API Keys اللي فيها
      الـ App ID) كـ secret سري — هيطلب منك تلزقه وقت التنفيذ:
      firebase functions:secrets:set ONESIGNAL_REST_KEY
   5) انزّل الباكدجات وارفع الفنكشن:
      cd functions && npm install && cd ..
      firebase deploy --only functions
   ============================================================ */

const { onValueCreated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const ONESIGNAL_REST_KEY = defineSecret("ONESIGNAL_REST_KEY");
const ONESIGNAL_APP_ID = "698e7216-d4b9-4805-8481-08293be3572b";

exports.sendQueuedPush = onValueCreated(
    {
        ref: "/mr_alfaham_data/pushQueue/{pushId}",
        instance: "mr-aalfahm-default-rtdb",
        region: "us-central1",
        secrets: [ONESIGNAL_REST_KEY],
    },
    async (event) => {
        const data = event.data.val();
        if (!data || !data.body) {
            await event.data.ref.remove();
            return;
        }

        const title = data.title || "عالفحم MR";
        const body = data.body;
        const dept = data.dept || null;

        const payload = {
            app_id: ONESIGNAL_APP_ID,
            headings: { en: title, ar: title },
            contents: { en: body, ar: body },
        };

        /* لو الرسالة خاصة بقسم معيّن (صالة أو مطبخ)، استهدف بس الأجهزة
           اللي عليها tag "department" بنفس القيمة دي (متحطة تلقائيًا
           لكل حساب وقت تسجيل الدخول — شوف syncOneSignalIdentity في
           index.html). لو مفيش قسم محدد، ابعتها لكل الأجهزة المفعّلة. */
        if (dept === "hall" || dept === "kitchen") {
            payload.filters = [
                { field: "tag", key: "department", relation: "=", value: dept },
            ];
        } else {
            // ⚠️ اسم الـ segment ده لازم يطابق اسم موجود فعليًا في
            // OneSignal Dashboard → Audience → Segments عندك. لو مختلف،
            // غيّر القيمة تحت لنفس الاسم الظاهر عندك (غالبًا "Subscribed
            // Users" أو "Total Subscriptions").
            payload.included_segments = ["Subscribed Users"];
        }

        try {
            const res = await fetch("https://onesignal.com/api/v1/notifications", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Authorization": `Basic ${ONESIGNAL_REST_KEY.value()}`,
                },
                body: JSON.stringify(payload),
            });
            const resJson = await res.json().catch(() => ({}));
            if (!res.ok) {
                logger.error("OneSignal send failed", { status: res.status, resJson });
            } else {
                logger.info("OneSignal send ok", { id: resJson.id, recipients: resJson.recipients });
            }
        } catch (err) {
            logger.error("OneSignal request error", err);
        }

        // نمسح العنصر من الطابور سواء نجح الإرسال أو فشل — عشان الطابور
        // يفضل نضيف ومنعملش إعادة محاولات لا نهائية على نفس الرسالة.
        await event.data.ref.remove();
    }
);
