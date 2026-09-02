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

  const { uid, orderId, rating, comment } = req.body;
  if (!uid || !orderId || !rating) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อนี้' });

    const order = orderDoc.data();
    if (order.buyerUid !== uid) return res.status(403).json({ error: 'ไม่มีสิทธิ์ทำรายการนี้' });
    if (order.status !== 'completed') return res.status(400).json({ error: 'ให้คะแนนได้เฉพาะออเดอร์ที่เสร็จสิ้นแล้วเท่านั้น' });
    if (order.rating) return res.status(400).json({ error: 'ให้คะแนนออเดอร์นี้ไปแล้ว' });

    await orderRef.update({ rating, comment: comment || '' });

    // เขียนรีวิวแยกไว้ที่ collection กลาง (ใช้แสดงในหน้าสินค้า)
    for (const item of order.items) {
      await adminDb.collection('reviews').add({
        productId: item.productId,
        shopId: order.shopId,
        buyerUid: uid,
        rating,
        comment: comment || '',
        createdAt: new Date()
      });

      // คำนวณคะแนนเฉลี่ยใหม่ของสินค้า
      const productRef = adminDb.collection('products').doc(item.productId);
      const productDoc = await productRef.get();
      if (productDoc.exists) {
        const p = productDoc.data();
        const newCount = (p.ratingCount || 0) + 1;
        const newRating = (((p.rating || 0) * (p.ratingCount || 0)) + rating) / newCount;
        await productRef.update({ rating: newRating, ratingCount: newCount });
      }
    }

    // คำนวณคะแนนเฉลี่ยใหม่ของร้าน
    const shopRef = adminDb.collection('shops').doc(order.shopId);
    const shopDoc = await shopRef.get();
    if (shopDoc.exists) {
      const s = shopDoc.data();
      const newCount = (s.ratingCount || 0) + 1;
      const newRating = (((s.rating || 0) * (s.ratingCount || 0)) + rating) / newCount;
      await shopRef.update({ rating: newRating, ratingCount: newCount });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}