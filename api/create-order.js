import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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
const COUPON_VALUE = 10; // 🔴 1 คูปอง = ลด 10 บาท ตามที่ตกลงกันไว้

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { uid, cartItemIds, deliveryMethod, addressId, useCoupon } = req.body;
  if (!uid || !cartItemIds || cartItemIds.length === 0) {
    return res.status(400).json({ error: 'ไม่มีสินค้าที่เลือก' });
  }

  try {
    // ดึงข้อมูลตะกร้าที่เลือกจริง (อ่านจาก Firestore ไม่เชื่อราคาจากเบราว์เซอร์)
    const cartItems = [];
    for (const itemId of cartItemIds) {
      const itemDoc = await adminDb.collection('users').doc(uid).collection('cart').doc(itemId).get();
      if (itemDoc.exists) cartItems.push({ id: itemDoc.id, ...itemDoc.data() });
    }
    if (cartItems.length === 0) return res.status(400).json({ error: 'ไม่พบสินค้าในตะกร้า' });

    // แยกออเดอร์ตามร้านค้า (1 ร้าน = 1 ออเดอร์)
    const shopGroups = {};
    for (const item of cartItems) {
      if (!shopGroups[item.shopId]) shopGroups[item.shopId] = [];
      shopGroups[item.shopId].push(item);
    }

    let couponApplied = false;
    const orderIds = [];

    for (const [shopId, items] of Object.entries(shopGroups)) {
      let itemsTotal = 0;

      // เช็คสต็อกจริง + คำนวณราคาจริงจาก products collection
      const orderItems = [];
      for (const item of items) {
        const productRef = adminDb.collection('products').doc(item.productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) throw new Error(`ไม่พบสินค้า ${item.name}`);
        const product = productDoc.data();

        if (product.stock < item.qty) throw new Error(`สินค้า ${item.name} เหลือไม่พอ`);

        // ตัดสต็อก + เพิ่มยอดขาย
        await productRef.update({
          stock: product.stock - item.qty,
          sold: (product.sold || 0) + item.qty
        });

        itemsTotal += product.price * item.qty;
        orderItems.push({ productId: item.productId, name: product.name, variant: item.variant || null, qty: item.qty, price: product.price });
      }

      const deliveryFee = deliveryMethod === 'delivery' ? 50 : 0;

      // ใช้คูปองแค่ครั้งเดียว (ออเดอร์แรกในการ checkout นี้เท่านั้น)
      let discountAmount = 0;
      if (useCoupon && !couponApplied) {
        // เช็คสิทธิ์ส่วนลดที่เหลือจริง (จากยอดสะสม Waste for Wealth หารด้วย 100 ลบด้วยที่ใช้ไปแล้ว)
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();

        const wasteLogsSnap = await adminDb.collection('users').doc(uid).collection('wasteLogs').get();
        let totalWaste = 0;
        wasteLogsSnap.forEach(d => totalWaste += d.data().amount || 0);

        const totalCoupons = Math.floor(totalWaste / 100);
        const usedCoupons = userData.wasteCouponsRedeemed || 0;
        const availableCoupons = totalCoupons - usedCoupons;

        if (availableCoupons > 0) {
          discountAmount = COUPON_VALUE;
          couponApplied = true;
          await adminDb.collection('users').doc(uid).update({
            wasteCouponsRedeemed: usedCoupons + 1
          });
        }
      }

      const totalAmount = Math.max(itemsTotal + deliveryFee - discountAmount, 0);

      const orderRef = await adminDb.collection('orders').add({
        buyerUid: uid,
        shopId,
        items: orderItems,
        deliveryMethod,
        addressId: deliveryMethod === 'delivery' ? addressId : null,
        deliveryFee,
        discountAmount,
        itemsTotal,
        totalAmount,
        status: 'pending_payment',
        createdAt: Timestamp.now(),
        slipDeadline: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
      });

      orderIds.push(orderRef.id);
    }

    // ลบสินค้าที่ checkout แล้วออกจากตะกร้า
    for (const itemId of cartItemIds) {
      await adminDb.collection('users').doc(uid).collection('cart').doc(itemId).delete();
    }

    return res.status(200).json({ success: true, orderIds });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}