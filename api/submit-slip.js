import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const adminDb = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { uid, orderId, slipUrl } = req.body;
  if (!uid || !orderId || !slipUrl) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อนี้' });

    const order = orderDoc.data();
    if (order.buyerUid !== uid) return res.status(403).json({ error: 'ไม่มีสิทธิ์ทำรายการนี้' });
    if (order.status !== 'pending_payment') return res.status(400).json({ error: 'คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน' });

    const now = Date.now();
    if (order.slipDeadline && now > order.slipDeadline.toMillis()) {
      return res.status(400).json({ error: 'เกินกำหนดเวลาอัปโหลดสลิป 24 ชั่วโมงแล้ว' });
    }

    await orderRef.update({
      slipUrl,
      status: 'pending_verify',
      slipUploadedAt: new Date()
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}