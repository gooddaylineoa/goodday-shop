import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { initLineAuth } from './lineAuth.js';

function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-blue-500' };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white rounded-2xl shadow-lg px-5 py-4 text-lg font-bold`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
window.showToast = showToast;

function showView(id) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.showView = showView;

function showLoading(msg = 'กำลังประมวลผล...') {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-[10000] flex flex-col items-center justify-center';
    overlay.innerHTML = `<div class="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin"></div><p class="text-white font-black text-lg mt-4" id="loading-text">${msg}</p>`;
    document.body.appendChild(overlay);
  } else {
    document.getElementById('loading-text').innerText = msg;
    overlay.classList.remove('hidden');
  }
}
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

let currentUid = null;

document.getElementById('btn-go-register').onclick = () => {
  window.location.href = 'https://goodday-member-system.vercel.app';
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await getDoc(doc(db, 'users', currentUid));
    const data = snap.exists() ? snap.data() : null;

    if (!data || !data.profileComplete) {
      showView('not-member-view');
      return;
    }

    const addrSnap = await getDocs(collection(db, 'users', currentUid, 'addresses'));
    if (addrSnap.empty) {
      showView('no-address-view');
      return;
    }

    showView('home-view');
    await loadLikedProducts();
    await loadProducts();
    await updateCartBadge();
  } else {
    currentUid = null;
    try {
      await initLineAuth();
    } catch (err) {
      console.error('Auto LINE login failed:', err);
      showToast('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่', 'error');
    }
  }
});

document.getElementById('btn-go-add-address').onclick = () => showView('first-address-view');

document.getElementById('btn-save-first-address').onclick = async () => {
  const recipient = document.getElementById('fa-recipient').value.trim();
  const phone = document.getElementById('fa-phone').value.trim();
  const detail = document.getElementById('fa-detail').value.trim();
  const subdist = document.getElementById('fa-subdist').value.trim();
  const dist = document.getElementById('fa-dist').value.trim();
  const prov = document.getElementById('fa-prov').value;
  const zip = document.getElementById('fa-zip').value.trim();
  const errBox = document.getElementById('fa-error');

  if (!recipient || !phone || !detail || !subdist || !dist || !prov || !zip) {
    errBox.innerText = 'กรุณากรอกข้อมูลให้ครบทุกช่อง';
    errBox.classList.remove('hidden');
    return;
  }
  errBox.classList.add('hidden');

  showLoading('กำลังบันทึกที่อยู่...');
  try {
    const addrRef = doc(collection(db, 'users', currentUid, 'addresses'));
    await setDoc(addrRef, { recipient, phone, detail, subdist, dist, prov, zip, isDefault: true, createdAt: serverTimestamp() });
    showView('home-view');
    await loadProducts();
  } catch (err) {
    errBox.innerText = 'เกิดข้อผิดพลาด: ' + err.message;
    errBox.classList.remove('hidden');
  } finally {
    hideLoading();
  }
};

let allProductsData = [];
let allShopsData = {};

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadProducts() {
  const shopsSnap = await getDocs(collection(db, 'shops'));
  allShopsData = {};
  shopsSnap.forEach(d => allShopsData[d.id] = { id: d.id, ...d.data() });

  const productsSnap = await getDocs(collection(db, 'products'));
  allProductsData = [];
  productsSnap.forEach(d => allProductsData.push({ id: d.id, ...d.data() }));

  renderProductGrid(shuffleArray(allProductsData));
}

document.getElementById('home-search').oninput = (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) { renderProductGrid(shuffleArray(allProductsData)); return; }
  const filtered = allProductsData.filter(p => {
    const shop = allShopsData[p.shopId];
    return p.name.toLowerCase().includes(term) || (shop && shop.name.toLowerCase().includes(term));
  });
  renderProductGrid(filtered);
};

function renderProductGrid(products) {
  const grid = document.getElementById('product-grid');
  if (products.length === 0) {
    grid.innerHTML = '<p class="col-span-2 text-center text-gray-400 text-lg py-8">ไม่พบสินค้าที่ค้นหา</p>';
    return;
  }
  grid.innerHTML = products.map(p => {
    const shop = allShopsData[p.shopId] || {};
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer" onclick="openProductDetail('${p.id}')">
        <div class="w-full aspect-square bg-gradient-to-br from-pink-50 to-rose-100 flex items-center justify-center text-4xl text-pink-300">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <div class="p-3">
          <h4 class="font-bold text-gray-800 text-base leading-tight mb-1 line-clamp-2">${p.name}</h4>
          <p class="text-lg font-black theme-text mb-1">฿${(p.price || 0).toLocaleString()}</p>
          <p class="text-sm text-gray-400 mb-1">ขายแล้ว ${p.sold || 0} ชิ้น</p>
          <p class="text-sm text-gray-500 truncate"><i class="fa-solid fa-shop mr-1"></i>${shop.name || 'ร้านค้า'}</p>
        </div>
      </div>`;
  }).join('');
}

function openShopPage(shopId) {
  const shop = allShopsData[shopId];
  if (!shop) return;
  document.getElementById('shop-name').innerText = shop.name;
  document.getElementById('shop-description').innerText = shop.description || '';
  document.getElementById('shop-rating').innerText = (shop.rating || 0).toFixed(1);
  document.getElementById('shop-followers').innerText = shop.followerCount || 0;

  const shopProducts = allProductsData.filter(p => p.shopId === shopId);
  document.getElementById('shop-product-grid').innerHTML = shopProducts.map(p => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="w-full aspect-square bg-gradient-to-br from-pink-50 to-rose-100 flex items-center justify-center text-4xl text-pink-300">
        <i class="fa-solid fa-box-open"></i>
      </div>
      <div class="p-3">
        <h4 class="font-bold text-gray-800 text-base leading-tight mb-1 line-clamp-2">${p.name}</h4>
        <p class="text-lg font-black theme-text">฿${(p.price || 0).toLocaleString()}</p>
        <p class="text-sm text-gray-400">ขายแล้ว ${p.sold || 0} ชิ้น</p>
      </div>
    </div>
  `).join('');

  showView('shop-view');
}
window.openShopPage = openShopPage;

document.getElementById('btn-back-shop').onclick = () => showView('home-view');
document.getElementById('tab-home').onclick = () => showView('home-view');
document.getElementById('tab-cart').onclick = () => showToast('หน้าตะกร้า จะทำในเฟสถัดไป', 'info');
document.getElementById('tab-account').onclick = () => showToast('หน้าบัญชี จะทำในเฟสถัดไป', 'info');
document.getElementById('btn-notif-bell').onclick = () => showToast('ระบบแจ้งเตือน จะทำในเฟสถัดไป', 'info');

function fillProvinceSelect(selectEl) {
  const provinces = ["กรุงเทพมหานคร","นครปฐม","นนทบุรี","ปทุมธานี","สมุทรปราการ","ชลบุรี","เชียงใหม่","ขอนแก่น"];
  provinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.innerText = p;
    selectEl.appendChild(opt);
  });
}
fillProvinceSelect(document.getElementById('fa-prov'));

import { addDoc, deleteDoc, query, orderBy, updateDoc, increment } from 'firebase/firestore';
// 🆕 ต้องเพิ่ม import เหล่านี้เข้าไปในบรรทัด import เดิมด้านบนสุดของไฟล์ (รวมกับที่มีอยู่แล้ว)

let currentProductId = null;
let currentProductShopId = null;
window.currentProductShopId = null;
let selectedVariant = null;
let selectedQty = 1;
let productLikedIds = new Set();

function openProductDetail(productId) {
  const p = allProductsData.find(x => x.id === productId);
  if (!p) return;
  const shop = allShopsData[p.shopId] || {};

  currentProductId = productId;
  currentProductShopId = p.shopId;
  window.currentProductShopId = p.shopId;
  selectedVariant = null;
  selectedQty = 1;

  document.getElementById('pd-name').innerText = p.name;
  document.getElementById('pd-price').innerText = `฿${(p.price || 0).toLocaleString()}`;
  document.getElementById('pd-rating').innerText = (p.rating || 0).toFixed(1);
  document.getElementById('pd-rating-count').innerText = p.ratingCount || 0;
  document.getElementById('pd-sold').innerText = p.sold || 0;
  document.getElementById('pd-stock').innerText = p.stock || 0;
  document.getElementById('pd-shop-name').innerText = shop.name || 'ร้านค้า';
  document.getElementById('pd-description').innerText = p.description || '';
  document.getElementById('pd-qty').innerText = '1';

  // ตัวเลือกสี/ไซส์ (ถ้ามี)
  const variantSection = document.getElementById('pd-variant-section');
  if (p.variants && p.variants.length > 0) {
    variantSection.classList.remove('hidden');
    document.getElementById('pd-variant-options').innerHTML = p.variants[0].options.map(opt => `
      <button data-variant="${opt}" class="pd-variant-btn px-4 py-2 rounded-xl border-2 border-gray-200 text-base font-bold">${opt}</button>
    `).join('');
    document.querySelectorAll('.pd-variant-btn').forEach(btn => {
      btn.onclick = () => {
        selectedVariant = btn.dataset.variant;
        document.querySelectorAll('.pd-variant-btn').forEach(b => b.className = 'pd-variant-btn px-4 py-2 rounded-xl border-2 border-gray-200 text-base font-bold');
        btn.className = 'pd-variant-btn px-4 py-2 rounded-xl border-2 theme-pink text-white border-transparent font-bold';
      };
    });
  } else {
    variantSection.classList.add('hidden');
  }

  // คำนวณวันจัดส่งโดยประมาณ (สั่งวันนี้ → ได้รับภายใน 3-5 วัน)
  const today = new Date();
  const minDate = new Date(today); minDate.setDate(today.getDate() + 3);
  const maxDate = new Date(today); maxDate.setDate(today.getDate() + 5);
  const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const fmt = (d) => `${d.getDate()} ${thaiMonths[d.getMonth()]}`;
  document.getElementById('pd-delivery-estimate').innerText = `สั่งวันนี้ ได้รับภายใน ${fmt(minDate)} - ${fmt(maxDate)} ${maxDate.getFullYear() + 543}`;

  // สถานะถูกใจ
  const likeBtn = document.getElementById('btn-like-product');
  const isLiked = productLikedIds.has(productId);
  likeBtn.innerHTML = isLiked ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
  likeBtn.className = `w-11 h-11 bg-gray-50 rounded-full flex items-center justify-center text-xl shrink-0 ml-2 ${isLiked ? 'text-rose-500' : 'text-gray-400'}`;

  loadProductReviews(productId);
  showView('product-detail-view');
}
window.openProductDetail = openProductDetail;

document.getElementById('btn-back-product').onclick = () => showView('home-view');

document.getElementById('pd-qty-minus').onclick = () => {
  if (selectedQty > 1) { selectedQty--; document.getElementById('pd-qty').innerText = selectedQty; }
};
document.getElementById('pd-qty-plus').onclick = () => {
  const p = allProductsData.find(x => x.id === currentProductId);
  if (selectedQty < (p.stock || 0)) { selectedQty++; document.getElementById('pd-qty').innerText = selectedQty; }
  else showToast('จำนวนสินค้าไม่พอ', 'error');
};

// --- ถูกใจสินค้า ---
document.getElementById('btn-like-product').onclick = async () => {
  const likeRef = doc(db, 'users', currentUid, 'likedProducts', currentProductId);
  const isLiked = productLikedIds.has(currentProductId);

  showLoading(isLiked ? 'กำลังเอาออกจากรายการถูกใจ...' : 'กำลังเพิ่มในรายการถูกใจ...');
  try {
    if (isLiked) {
      await deleteDoc(likeRef);
      productLikedIds.delete(currentProductId);
    } else {
      await setDoc(likeRef, { productId: currentProductId, likedAt: serverTimestamp() });
      productLikedIds.add(currentProductId);
    }
    openProductDetail(currentProductId); // รีเฟรชไอคอนหัวใจ
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

// --- เพิ่มลงตะกร้า (เก็บถาวรใน Firestore) ---
document.getElementById('btn-add-cart').onclick = async () => {
  const p = allProductsData.find(x => x.id === currentProductId);
  if (p.variants && p.variants.length > 0 && !selectedVariant) {
    showToast('กรุณาเลือกตัวเลือกสินค้าก่อน', 'error');
    return;
  }

  showLoading('กำลังเพิ่มลงตะกร้า...');
  try {
    await addDoc(collection(db, 'users', currentUid, 'cart'), {
      productId: currentProductId,
      shopId: currentProductShopId,
      name: p.name,
      price: p.price,
      variant: selectedVariant || null,
      qty: selectedQty,
      addedAt: serverTimestamp()
    });
    showToast('เพิ่มลงตะกร้าแล้ว!', 'success');
    await updateCartBadge();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

// --- ซื้อเลย (ไปหน้า checkout แยก จะทำในเฟสถัดไป) ---
document.getElementById('btn-buy-now').onclick = () => {
  const p = allProductsData.find(x => x.id === currentProductId);
  if (p.variants && p.variants.length > 0 && !selectedVariant) {
    showToast('กรุณาเลือกตัวเลือกสินค้าก่อน', 'error');
    return;
  }
  showToast('หน้าสั่งซื้อสินค้า จะทำในเฟสถัดไป', 'info');
};

// --- นับจำนวนสินค้าในตะกร้า โชว์เป็น badge ที่แท็บล่าง ---
async function updateCartBadge() {
  const cartSnap = await getDocs(collection(db, 'users', currentUid, 'cart'));
  const badge = document.getElementById('cart-badge');
  if (badge) {
    if (cartSnap.size > 0) {
      badge.innerText = cartSnap.size;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// --- รีวิวสินค้า ---
async function loadProductReviews(productId) {
  const container = document.getElementById('pd-reviews-list');
  container.innerHTML = '<p class="text-center text-gray-400 text-base py-4">กำลังโหลดรีวิว...</p>';

  const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const reviews = [];
  snap.forEach(d => { if (d.data().productId === productId) reviews.push(d.data()); });

  if (reviews.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-base py-4">ยังไม่มีรีวิว</p>';
    return;
  }

  container.innerHTML = reviews.map(r => `
    <div class="bg-gray-50 rounded-xl p-3">
      <div class="text-amber-400 text-base mb-1">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      <p class="text-base text-gray-600">${r.comment || ''}</p>
    </div>
  `).join('');
}

// --- โหลดรายการถูกใจตอน login ---
async function loadLikedProducts() {
  const snap = await getDocs(collection(db, 'users', currentUid, 'likedProducts'));
  productLikedIds = new Set();
  snap.forEach(d => productLikedIds.add(d.id));
}

// ================= ตะกร้า + Checkout =================

let allCartItems = [];
let selectedCartItemIds = new Set();
let currentDeliveryMethod = 'delivery';
let userAddresses = [];
let availableCoupons = 0;

document.getElementById('tab-cart').onclick = () => { showView('cart-view'); loadCart(); };
document.getElementById('btn-back-cart').onclick = () => showView('home-view');

async function loadCart() {
  const container = document.getElementById('cart-list-container');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const snap = await getDocs(collection(db, 'users', currentUid, 'cart'));
  allCartItems = [];
  snap.forEach(d => allCartItems.push({ id: d.id, ...d.data() }));

  selectedCartItemIds = new Set();

  if (allCartItems.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ตะกร้าว่างเปล่า</p>';
    updateCartSummary();
    return;
  }

  container.innerHTML = allCartItems.map(item => {
    const shop = allShopsData[item.shopId] || {};
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
        <input type="checkbox" class="cart-item-checkbox w-6 h-6" data-item-id="${item.id}">
        <div class="w-16 h-16 bg-gradient-to-br from-pink-50 to-rose-100 rounded-xl flex items-center justify-center text-2xl text-pink-300 shrink-0">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-gray-800 text-base leading-tight truncate">${item.name}</h4>
          ${item.variant ? `<p class="text-sm text-gray-400">ตัวเลือก: ${item.variant}</p>` : ''}
          <p class="text-sm text-gray-400"><i class="fa-solid fa-shop mr-1"></i>${shop.name || 'ร้านค้า'}</p>
          <div class="flex justify-between items-center mt-1">
            <p class="text-lg font-black theme-text">฿${(item.price * item.qty).toLocaleString()}</p>
            <p class="text-sm text-gray-400">x${item.qty}</p>
          </div>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.cart-item-checkbox').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) selectedCartItemIds.add(cb.dataset.itemId);
      else selectedCartItemIds.delete(cb.dataset.itemId);
      updateCartSummary();
    };
  });

  updateCartSummary();
}

function updateCartSummary() {
  const selectedItems = allCartItems.filter(item => selectedCartItemIds.has(item.id));
  const total = selectedItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  document.getElementById('cart-total').innerText = `฿${total.toLocaleString()}`;

  const btn = document.getElementById('btn-go-checkout');
  if (selectedItems.length > 0) {
    btn.disabled = false;
    btn.className = 'w-full theme-pink text-white py-4 rounded-2xl font-black text-lg';
    btn.innerText = `ไปหน้าชำระเงิน (${selectedItems.length} ชิ้น)`;
  } else {
    btn.disabled = true;
    btn.className = 'w-full bg-gray-300 text-white py-4 rounded-2xl font-black text-lg';
    btn.innerText = 'เลือกสินค้าที่ต้องการซื้อ';
  }
}

document.getElementById('btn-go-checkout').onclick = async () => {
  await openCheckout();
};

async function openCheckout() {
  const selectedItems = allCartItems.filter(item => selectedCartItemIds.has(item.id));

  document.getElementById('checkout-items-list').innerHTML = selectedItems.map(item => `
    <div class="flex justify-between text-base">
      <span class="text-gray-600">${item.name} ${item.variant ? `(${item.variant})` : ''} x${item.qty}</span>
      <span class="font-bold text-gray-800">฿${(item.price * item.qty).toLocaleString()}</span>
    </div>
  `).join('');

  // โหลดที่อยู่
  const addrSnap = await getDocs(collection(db, 'users', currentUid, 'addresses'));
  userAddresses = [];
  addrSnap.forEach(d => userAddresses.push({ id: d.id, ...d.data() }));
  renderAddressSelector();

  // เช็คสิทธิ์คูปองคงเหลือ
  const userSnap = await getDoc(doc(db, 'users', currentUid));
  const userData = userSnap.data();
  const wasteLogsSnap = await getDocs(collection(db, 'users', currentUid, 'wasteLogs'));
  let totalWaste = 0;
  wasteLogsSnap.forEach(d => totalWaste += d.data().amount || 0);
  const totalCoupons = Math.floor(totalWaste / 100);
  const usedCoupons = userData.wasteCouponsRedeemed || 0;
  availableCoupons = Math.max(totalCoupons - usedCoupons, 0);

  const couponSection = document.getElementById('coupon-section');
  if (availableCoupons > 0) {
    couponSection.classList.remove('hidden');
    document.getElementById('coupon-available-count').innerText = availableCoupons;
    document.getElementById('checkout-use-coupon').checked = false;
  } else {
    couponSection.classList.add('hidden');
  }

  currentDeliveryMethod = 'delivery';
  setDeliveryMode('delivery');
  recalcCheckoutTotal();

  showView('checkout-view');
}

document.getElementById('btn-back-checkout').onclick = () => showView('cart-view');

function renderAddressSelector() {
  const container = document.getElementById('checkout-address-select-container');
  if (userAddresses.length === 0) {
    container.innerHTML = '<p class="text-base text-red-500 font-bold">ไม่มีที่อยู่ กรุณาเพิ่มที่อยู่ก่อน</p>';
    return;
  }
  container.innerHTML = userAddresses.map((a, i) => `
    <label class="flex items-start gap-2 bg-gray-50 rounded-xl p-3 mb-2 cursor-pointer">
      <input type="radio" name="checkout-address" value="${a.id}" ${i === 0 ? 'checked' : ''} class="w-5 h-5 mt-1">
      <div class="text-base">
        <p class="font-bold text-gray-800">${a.recipient} · ${a.phone}</p>
        <p class="text-gray-500">${a.detail} ${a.subdist} ${a.dist} ${a.prov} ${a.zip}</p>
      </div>
    </label>
  `).join('');
}

function setDeliveryMode(mode) {
  currentDeliveryMethod = mode;
  const deliveryBtn = document.getElementById('btn-delivery-mode');
  const pickupBtn = document.getElementById('btn-pickup-mode');
  const addrBox = document.getElementById('checkout-address-box');

  if (mode === 'delivery') {
    deliveryBtn.className = 'py-3.5 rounded-xl font-black text-base border-2 theme-pink text-white border-transparent';
    pickupBtn.className = 'py-3.5 rounded-xl font-black text-base border-2 bg-gray-50 text-gray-600 border-gray-200';
    addrBox.classList.remove('hidden');
  } else {
    pickupBtn.className = 'py-3.5 rounded-xl font-black text-base border-2 theme-pink text-white border-transparent';
    deliveryBtn.className = 'py-3.5 rounded-xl font-black text-base border-2 bg-gray-50 text-gray-600 border-gray-200';
    addrBox.classList.add('hidden');
  }
  recalcCheckoutTotal();
}
document.getElementById('btn-delivery-mode').onclick = () => setDeliveryMode('delivery');
document.getElementById('btn-pickup-mode').onclick = () => setDeliveryMode('pickup');
document.getElementById('checkout-use-coupon').onchange = () => recalcCheckoutTotal();

function recalcCheckoutTotal() {
  const selectedItems = allCartItems.filter(item => selectedCartItemIds.has(item.id));
  const itemsTotal = selectedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const deliveryFee = currentDeliveryMethod === 'delivery' ? 50 : 0;
  const useCoupon = document.getElementById('checkout-use-coupon').checked;
  const discount = useCoupon ? 10 : 0;
  const grandTotal = Math.max(itemsTotal + deliveryFee - discount, 0);

  document.getElementById('ck-items-total').innerText = `฿${itemsTotal.toLocaleString()}`;
  document.getElementById('ck-delivery-fee').innerText = `฿${deliveryFee.toLocaleString()}`;
  document.getElementById('ck-discount-row').classList.toggle('hidden', discount === 0);
  document.getElementById('ck-discount').innerText = `-฿${discount.toLocaleString()}`;
  document.getElementById('ck-grand-total').innerText = `฿${grandTotal.toLocaleString()}`;
}

document.getElementById('btn-confirm-order').onclick = async () => {
  if (currentDeliveryMethod === 'delivery' && userAddresses.length === 0) {
    showToast('กรุณาเพิ่มที่อยู่ก่อนสั่งซื้อ', 'error');
    return;
  }

  const addressId = currentDeliveryMethod === 'delivery'
    ? document.querySelector('input[name="checkout-address"]:checked')?.value
    : null;

  const useCoupon = document.getElementById('checkout-use-coupon').checked;

  showLoading('กำลังสร้างคำสั่งซื้อ...');
  try {
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUid,
        cartItemIds: Array.from(selectedCartItemIds),
        deliveryMethod: currentDeliveryMethod,
        addressId,
        useCoupon
      })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showToast(data.error || 'สั่งซื้อไม่สำเร็จ', 'error');
      return;
    }

    showToast('สร้างคำสั่งซื้อสำเร็จ! กำลังไปหน้าชำระเงิน', 'success');
    showView('home-view');
    await loadProducts();
    await updateCartBadge();
    // 🔜 เฟส 4 จะพาไปหน้าชำระเงิน (QR+สลิป) จริงตรงนี้แทน
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};