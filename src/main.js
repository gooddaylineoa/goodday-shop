import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, orderBy, serverTimestamp, increment, onSnapshot } from 'firebase/firestore';
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
    await loadFollowedShops();
    await loadProducts();
    await updateCartBadge();
    await updateNotifBadge();
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

// ================= หน้าชำระเงิน (QR PromptPay + สลิป) =================

// อัลกอริทึมสร้าง PromptPay QR Payload (มาตรฐาน EMV QR) — คำนวณเองไม่ต้องพึ่ง API เสียเงิน
function formatPromptPayTarget(id) {
  id = id.replace(/[^0-9]/g, '');
  if (id.length === 13) return id; // เลขบัตร ปชช.
  if (id.length === 10 && id.startsWith('0')) return '66' + id.substring(1); // เบอร์โทร
  return id;
}

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePromptPayPayload(promptpayId, amount) {
  const target = formatPromptPayTarget(promptpayId);
  const isPhone = target.length === 13 && target.startsWith('66');

  const merchantInfo = tlv('00', 'A000000677010111') +
    tlv(isPhone ? '01' : '02', target);

  let payload =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('29', merchantInfo) +
    tlv('53', '764') +
    tlv('54', amount.toFixed(2)) +
    tlv('58', 'TH');

  payload += '6304';
  const checksum = crc16(payload);
  return payload + checksum;
}

let currentOrderIdForPayment = null;
let paymentCountdownInterval = null;

async function openPaymentView(orderId) {
  currentOrderIdForPayment = orderId;
  const orderDoc = await getDoc(doc(db, 'orders', orderId));
  if (!orderDoc.exists()) { showToast('ไม่พบคำสั่งซื้อนี้', 'error'); return; }
  const order = orderDoc.data();

  const shopDoc = await getDoc(doc(db, 'shops', order.shopId));
  const shop = shopDoc.exists() ? shopDoc.data() : {};

  document.getElementById('payment-amount').innerText = `฿${order.totalAmount.toLocaleString()}`;
  document.getElementById('payment-bank-name').innerText = shop.bankName || '-';
  document.getElementById('payment-account-number').innerText = shop.bankAccountNumber || '-';
  document.getElementById('payment-account-name').innerText = shop.bankAccountName || '-';

  if (shop.promptpayId) {
    const payload = generatePromptPayPayload(shop.promptpayId, order.totalAmount);
    document.getElementById('payment-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
  }

  // นับถอยหลัง 24 ชม.
  if (paymentCountdownInterval) clearInterval(paymentCountdownInterval);
  const deadline = order.slipDeadline.toDate ? order.slipDeadline.toDate() : new Date(order.slipDeadline);
  paymentCountdownInterval = setInterval(() => {
    const diff = deadline - new Date();
    if (diff <= 0) {
      clearInterval(paymentCountdownInterval);
      document.getElementById('payment-countdown').innerText = 'หมดเวลาแล้ว';
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('payment-countdown').innerText = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);

  document.getElementById('slip-preview').classList.add('hidden');
  document.getElementById('slip-placeholder').classList.remove('hidden');
  document.getElementById('slip-input').value = '';

  showView('payment-view');
}
window.openPaymentView = openPaymentView;

document.getElementById('btn-download-qr').onclick = () => {
  const link = document.createElement('a');
  link.href = document.getElementById('payment-qr-img').src;
  link.download = 'promptpay-qr.png';
  link.target = '_blank';
  link.click();
};

document.getElementById('btn-leave-payment').onclick = () => {
  if (paymentCountdownInterval) clearInterval(paymentCountdownInterval);
  showPendingStatus('pending_payment');
};

let selectedSlipFile = null;

document.getElementById('slip-preview-box').onclick = () => document.getElementById('slip-input').click();

document.getElementById('slip-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedSlipFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('slip-preview').src = ev.target.result;
    document.getElementById('slip-preview').classList.remove('hidden');
    document.getElementById('slip-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
};

document.getElementById('btn-submit-slip').onclick = async () => {
  if (!selectedSlipFile) {
    showToast('กรุณาแนบภาพสลิปก่อน', 'error');
    return;
  }

  showLoading('กำลังอัปโหลดสลิป...');
  try {
    const formData = new FormData();
    formData.append('file', selectedSlipFile);
    formData.append('upload_preset', 'goodday_unsigned');

    const uploadRes = await fetch('https://api.cloudinary.com/v1_1/l1htg1ks/image/upload', {
      method: 'POST', body: formData
    });
    const uploadData = await uploadRes.json();

    if (!uploadData.secure_url) {
      hideLoading();
      showToast('อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }

    showLoading('กำลังยืนยันการชำระเงิน...');

    const res = await fetch('/api/submit-slip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, orderId: currentOrderIdForPayment, slipUrl: uploadData.secure_url })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showToast(data.error || 'ยืนยันไม่สำเร็จ', 'error');
      return;
    }

    if (paymentCountdownInterval) clearInterval(paymentCountdownInterval);
    showPendingStatus('pending_verify');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

function showPendingStatus(status) {
  const titleEl = document.getElementById('pending-title');
  const msgEl = document.getElementById('pending-message');

  if (status === 'pending_payment') {
    titleEl.innerText = 'สินค้าอยู่ระหว่างรอชำระเงิน';
    msgEl.innerText = 'กรุณาชำระเงินภายใน 24 ชั่วโมง ไม่งั้นคำสั่งซื้ออาจถูกยกเลิก';
  } else {
    titleEl.innerText = 'รอการตรวจสอบจากทีมงาน';
    msgEl.innerText = 'ทีมงานจะตรวจสอบสลิปและอัปเดตสถานะให้เร็วที่สุด';
  }

  showView('order-pending-view');
}

document.getElementById('btn-pending-go-home').onclick = async () => {
  showView('home-view');
  await loadProducts();
};
document.getElementById('btn-pending-go-status').onclick = () => {
  showToast('หน้าติดตามสถานะสินค้า จะทำในเฟสถัดไป', 'info');
};

// ================= บัญชีของฉัน =================

document.getElementById('tab-account').onclick = () => { showView('account-view'); loadAccount(); };
document.getElementById('acc-tab-home').onclick = () => showView('home-view');
document.getElementById('acc-tab-cart').onclick = () => { showView('cart-view'); loadCart(); };
document.getElementById('acc-tab-account').onclick = () => { showView('account-view'); loadAccount(); };

async function loadAccount() {
  await checkShopOwnerStatus(); // 🆕 เพิ่มบรรทัดนี้บนสุด
  const userDoc = await getDoc(doc(db, 'users', currentUid));
  const data = userDoc.data();
  document.getElementById('acc-name').innerText = data.name || 'ผู้ใช้งาน';
  document.getElementById('acc-memberid').innerText = data.memberId || '-';

  const addrSnap = await getDocs(collection(db, 'users', currentUid, 'addresses'));
  const addrList = document.getElementById('acc-address-list');
  if (addrSnap.empty) {
    addrList.innerHTML = '<p class="text-base text-gray-400 text-center py-3">ยังไม่มีที่อยู่</p>';
  } else {
    const items = [];
    addrSnap.forEach(d => items.push(d.data()));
    addrList.innerHTML = items.map(a => `
      <div class="bg-white rounded-xl border border-gray-100 p-3 text-base">
        <p class="font-bold text-gray-800">${a.recipient} · ${a.phone}</p>
        <p class="text-gray-500">${a.detail} ${a.subdist} ${a.dist} ${a.prov} ${a.zip}</p>
      </div>
    `).join('');
  }
}

// --- สินค้าที่ถูกใจ ---
async function openLikedProductsView() {
  await loadLikedProducts();
  const liked = allProductsData.filter(p => productLikedIds.has(p.id));
  const grid = document.getElementById('liked-products-grid');

  if (liked.length === 0) {
    grid.innerHTML = '<p class="col-span-2 text-center text-gray-400 text-lg py-8">ยังไม่มีสินค้าที่ถูกใจ</p>';
  } else {
    grid.innerHTML = liked.map(p => {
      const shop = allShopsData[p.shopId] || {};
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer" onclick="openProductDetail('${p.id}')">
          <div class="w-full aspect-square bg-gradient-to-br from-pink-50 to-rose-100 flex items-center justify-center text-4xl text-pink-300">
            <i class="fa-solid fa-box-open"></i>
          </div>
          <div class="p-3">
            <h4 class="font-bold text-gray-800 text-base leading-tight mb-1 line-clamp-2">${p.name}</h4>
            <p class="text-lg font-black theme-text mb-1">฿${(p.price || 0).toLocaleString()}</p>
            <p class="text-sm text-gray-500 truncate"><i class="fa-solid fa-shop mr-1"></i>${shop.name || 'ร้านค้า'}</p>
          </div>
        </div>`;
    }).join('');
  }
  showView('liked-products-view');
}
window.openLikedProductsView = openLikedProductsView;
document.getElementById('btn-back-liked').onclick = () => showView('account-view');

// ================= ติดตามสถานะสินค้า =================

let allMyOrders = [];
let currentOrderStatusTab = 'pending_payment';
let currentOrderDetail = null;

const orderStatusLabel = {
  pending_payment: 'รอชำระเงิน',
  pending_verify: 'รอตรวจสอบการชำระเงิน',
  preparing: 'กำลังจัดส่ง',
  shipping: 'อยู่ระหว่างการจัดส่ง',
  completed: 'เสร็จสิ้น'
};
const orderStatusColor = {
  pending_payment: 'bg-orange-50 text-orange-600',
  pending_verify: 'bg-amber-50 text-amber-600',
  preparing: 'bg-blue-50 text-blue-600',
  shipping: 'bg-indigo-50 text-indigo-600',
  completed: 'bg-emerald-50 text-emerald-600'
};

function openOrderStatus() {
  showView('order-status-view');
  loadMyOrders();
}
window.openOrderStatus = openOrderStatus;

document.getElementById('btn-back-order-status').onclick = () => showView('account-view');

document.querySelectorAll('.order-tab').forEach(tab => {
  tab.onclick = () => {
    currentOrderStatusTab = tab.dataset.tab;
    document.querySelectorAll('.order-tab').forEach(t => {
      t.className = 'order-tab flex-1 py-3 text-base font-bold whitespace-nowrap px-4 text-gray-400 border-b-2 border-transparent';
    });
    tab.className = 'order-tab flex-1 py-3 text-base font-bold whitespace-nowrap px-4 theme-text border-b-2 border-pink-500';
    renderOrderStatusList();
  };
});

async function loadMyOrders() {
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  allMyOrders = [];
  snap.forEach(d => { if (d.data().buyerUid === currentUid) allMyOrders.push({ id: d.id, ...d.data() }); });
  renderOrderStatusList();
}

function renderOrderStatusList() {
  const container = document.getElementById('order-status-list');
  let filtered;

  if (currentOrderStatusTab === 'pending_payment') {
    filtered = allMyOrders.filter(o => o.status === 'pending_payment' || o.status === 'pending_verify');
  } else if (currentOrderStatusTab === 'to_rate') {
    filtered = allMyOrders.filter(o => o.status === 'completed' && !o.rating);
  } else {
    filtered = allMyOrders.filter(o => o.status === currentOrderStatusTab);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ไม่มีคำสั่งซื้อในหมวดนี้</p>';
    return;
  }

  container.innerHTML = filtered.map(o => {
    const shop = allShopsData[o.shopId] || {};
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer" onclick="openOrderDetail('${o.id}')">
        <div class="flex justify-between items-center mb-2">
          <p class="text-base font-bold text-gray-500"><i class="fa-solid fa-shop mr-1"></i>${shop.name || 'ร้านค้า'}</p>
          <span class="text-sm font-bold px-2.5 py-1 rounded-full ${orderStatusColor[o.status] || ''}">${orderStatusLabel[o.status] || o.status}</span>
        </div>
        ${o.items.map(it => `<p class="text-base text-gray-700">${it.name} ${it.variant ? `(${it.variant})` : ''} x${it.qty}</p>`).join('')}
        <p class="text-right text-lg font-black theme-text mt-2">฿${o.totalAmount.toLocaleString()}</p>
      </div>`;
  }).join('');
}

function openOrderDetail(orderId) {
  const o = allMyOrders.find(x => x.id === orderId);
  if (!o) return;
  currentOrderDetail = o;

  const badge = document.getElementById('od-status-badge');
  badge.innerText = orderStatusLabel[o.status] || o.status;
  badge.className = `inline-block text-base font-bold px-3 py-1.5 rounded-full mb-3 ${orderStatusColor[o.status] || ''}`;

  document.getElementById('od-items-list').innerHTML = o.items.map(it => `
    <div class="flex justify-between text-base">
      <span class="text-gray-700">${it.name} ${it.variant ? `(${it.variant})` : ''} x${it.qty}</span>
      <span class="font-bold text-gray-800">฿${(it.price * it.qty).toLocaleString()}</span>
    </div>
  `).join('');

  document.getElementById('od-items-total').innerText = `฿${o.itemsTotal.toLocaleString()}`;
  document.getElementById('od-delivery-fee').innerText = `฿${o.deliveryFee.toLocaleString()}`;
  document.getElementById('od-discount-row').classList.toggle('hidden', !o.discountAmount);
  document.getElementById('od-discount').innerText = `-฿${(o.discountAmount || 0).toLocaleString()}`;
  document.getElementById('od-grand-total').innerText = `฿${o.totalAmount.toLocaleString()}`;

  document.getElementById('btn-order-go-pay').classList.toggle('hidden', o.status !== 'pending_payment');
  document.getElementById('btn-confirm-receipt').classList.toggle('hidden', o.status !== 'shipping');
  document.getElementById('btn-order-rate').classList.toggle('hidden', !(o.status === 'completed' && !o.rating));

  showView('order-detail-view');
}
window.openOrderDetail = openOrderDetail;

document.getElementById('btn-back-order-detail').onclick = () => showView('order-status-view');

document.getElementById('btn-order-go-pay').onclick = () => openPaymentView(currentOrderDetail.id);

document.getElementById('btn-confirm-receipt').onclick = async () => {
  if (!confirm('ยืนยันว่าได้รับสินค้าเรียบร้อยแล้วใช่ไหม?')) return;

  showLoading('กำลังยืนยันรับสินค้า...');
  try {
    const res = await fetch('/api/confirm-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, orderId: currentOrderDetail.id })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ยืนยันไม่สำเร็จ', 'error'); return; }

    showToast('ยืนยันรับสินค้าสำเร็จ!', 'success');
    await loadMyOrders();
    openReviewForm(currentOrderDetail.id);
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

document.getElementById('btn-order-rate').onclick = () => openReviewForm(currentOrderDetail.id);

let selectedOrderRating = 0;

function openReviewForm(orderId) {
  currentOrderDetail = allMyOrders.find(o => o.id === orderId) || currentOrderDetail;
  selectedOrderRating = 0;
  document.getElementById('review-comment').value = '';
  renderReviewStars();
  showView('order-review-view');
}

document.getElementById('btn-back-review').onclick = () => showView('order-detail-view');

function renderReviewStars() {
  document.getElementById('review-stars').innerHTML = [1,2,3,4,5].map(n => `
    <button data-star="${n}" class="review-star-btn text-4xl ${n <= selectedOrderRating ? 'text-amber-400' : 'text-gray-200'}">
      <i class="fa-solid fa-star"></i>
    </button>
  `).join('');
  document.querySelectorAll('.review-star-btn').forEach(btn => {
    btn.onclick = () => { selectedOrderRating = Number(btn.dataset.star); renderReviewStars(); };
  });
}

document.getElementById('btn-submit-review').onclick = async () => {
  if (selectedOrderRating === 0) { showToast('กรุณาเลือกจำนวนดาวก่อน', 'error'); return; }

  showLoading('กำลังส่งคะแนน...');
  try {
    const res = await fetch('/api/submit-order-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUid, orderId: currentOrderDetail.id,
        rating: selectedOrderRating, comment: document.getElementById('review-comment').value.trim()
      })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ส่งคะแนนไม่สำเร็จ', 'error'); return; }

    showToast('ขอบคุณสำหรับคะแนน!', 'success');
    showView('order-status-view');
    await loadMyOrders();
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

// --- สั่งซื้อสินค้าอีกครั้ง ---
document.getElementById('btn-order-buy-again').onclick = async () => {
  showLoading('กำลังเพิ่มลงตะกร้า...');
  try {
    for (const item of currentOrderDetail.items) {
      await addDoc(collection(db, 'users', currentUid, 'cart'), {
        productId: item.productId,
        shopId: currentOrderDetail.shopId,
        name: item.name,
        price: item.price,
        variant: item.variant || null,
        qty: item.qty,
        addedAt: serverTimestamp()
      });
    }
    await updateCartBadge();
    showToast('เพิ่มสินค้าลงตะกร้าแล้ว!', 'success');
    showView('cart-view');
    await loadCart();
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

// ================= ติดตามร้านค้า + สินค้าแนะนำ =================

let followedShopIds = new Set();
let currentShopIdViewing = null;

async function loadFollowedShops() {
  const snap = await getDocs(collection(db, 'users', currentUid, 'followedShops'));
  followedShopIds = new Set();
  snap.forEach(d => followedShopIds.add(d.id));
}

function updateFollowButton(shopId) {
  const btn = document.getElementById('btn-follow-shop');
  const isFollowed = followedShopIds.has(shopId);
  if (isFollowed) {
    btn.innerText = '✓ กำลังติดตาม';
    btn.className = 'w-full bg-gray-100 text-gray-600 py-2.5 rounded-xl font-black text-base';
  } else {
    btn.innerText = '+ ติดตาม';
    btn.className = 'w-full border-2 border-pink-500 theme-text py-2.5 rounded-xl font-black text-base';
  }
}

document.getElementById('btn-follow-shop').onclick = async () => {
  const shopId = currentShopIdViewing;
  const isFollowed = followedShopIds.has(shopId);
  const shopRef = doc(db, 'shops', shopId);

  showLoading(isFollowed ? 'กำลังเลิกติดตาม...' : 'กำลังติดตาม...');
  try {
    if (isFollowed) {
      await deleteDoc(doc(db, 'users', currentUid, 'followedShops', shopId));
      await updateDoc(shopRef, { followerCount: increment(-1) });
      followedShopIds.delete(shopId);
    } else {
      await setDoc(doc(db, 'users', currentUid, 'followedShops', shopId), { followedAt: serverTimestamp() });
      await updateDoc(shopRef, { followerCount: increment(1) });
      followedShopIds.add(shopId);
    }
    allShopsData[shopId].followerCount = (allShopsData[shopId].followerCount || 0) + (isFollowed ? -1 : 1);
    document.getElementById('shop-followers').innerText = allShopsData[shopId].followerCount;
    updateFollowButton(shopId);
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

// แก้ openShopPage เดิม เพิ่มส่วนสินค้าแนะนำ + ปุ่มติดตาม
const originalOpenShopPage = openShopPage;
window.openShopPage = function(shopId) {
  currentShopIdViewing = shopId;
  originalOpenShopPage(shopId);
  updateFollowButton(shopId);

  const shopProducts = allProductsData.filter(p => p.shopId === shopId);
  const featured = shopProducts.filter(p => p.isFeatured);
  const featuredSection = document.getElementById('shop-featured-section');

  if (featured.length > 0) {
    featuredSection.classList.remove('hidden');
    document.getElementById('shop-featured-grid').innerHTML = featured.map(p => `
      <div class="min-w-[160px] w-[160px] bg-white rounded-2xl shadow-sm border-2 border-amber-200 overflow-hidden shrink-0 cursor-pointer" onclick="openProductDetail('${p.id}')">
        <div class="w-full aspect-square bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center text-3xl text-amber-300 relative">
          <i class="fa-solid fa-box-open"></i>
          <span class="absolute top-2 left-2 bg-amber-400 text-white text-xs font-black px-2 py-0.5 rounded-full">แนะนำ</span>
        </div>
        <div class="p-3">
          <h4 class="font-bold text-gray-800 text-sm leading-tight mb-1 line-clamp-2">${p.name}</h4>
          <p class="text-base font-black theme-text">฿${(p.price || 0).toLocaleString()}</p>
        </div>
      </div>
    `).join('');
  } else {
    featuredSection.classList.add('hidden');
  }
};

// ================= ระบบแจ้งเตือน (กระดิ่ง) =================

document.getElementById('btn-notif-bell').onclick = () => { showView('notif-panel-view'); loadNotifications(); };
document.getElementById('btn-back-notif').onclick = () => showView('home-view');

async function loadNotifications() {
  const container = document.getElementById('notif-list-container');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'users', currentUid, 'notifications'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  if (snap.empty) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีการแจ้งเตือน</p>';
    return;
  }

  const notifIcons = {
    order_status: { icon: 'fa-box', color: 'text-blue-500 bg-blue-50' },
    new_shop: { icon: 'fa-shop', color: 'text-emerald-500 bg-emerald-50' },
    news: { icon: 'fa-bullhorn', color: 'text-amber-500 bg-amber-50' },
    new_product: { icon: 'fa-tag', color: 'text-pink-500 bg-pink-50' }
  };

  const notifs = [];
  snap.forEach(d => notifs.push({ id: d.id, ...d.data() }));

  container.innerHTML = notifs.map(n => {
    const style = notifIcons[n.type] || notifIcons.news;
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-start gap-3 cursor-pointer ${n.read ? 'opacity-60' : ''}" onclick="handleNotifClick('${n.id}', '${n.type}', '${n.linkId || ''}')">
        <div class="w-11 h-11 ${style.color} rounded-full flex items-center justify-center text-lg shrink-0"><i class="fa-solid ${style.icon}"></i></div>
        <div class="flex-1">
          <p class="font-bold text-gray-800 text-base">${n.title}</p>
          <p class="text-sm text-gray-500">${n.message}</p>
        </div>
        ${!n.read ? '<span class="w-2.5 h-2.5 bg-rose-500 rounded-full mt-2 shrink-0"></span>' : ''}
      </div>`;
  }).join('');
}

async function handleNotifClick(notifId, type, linkId) {
  await updateDoc(doc(db, 'users', currentUid, 'notifications', notifId), { read: true });

  if (type === 'order_status') {
    showView('order-status-view');
    await loadMyOrders();
  } else if (type === 'new_shop' || type === 'new_product') {
    await openShopPage(linkId);
  } else if (type === 'news') {
    const notifDoc = await getDoc(doc(db, 'users', currentUid, 'notifications', notifId));
    const n = notifDoc.data();
    document.getElementById('news-modal-title').innerText = n.title;
    document.getElementById('news-modal-message').innerText = n.fullMessage || n.message;
    const modal = document.getElementById('news-modal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
  }

  loadNotifications();
}
window.handleNotifClick = handleNotifClick;

document.getElementById('btn-close-news-modal').onclick = () => {
  const modal = document.getElementById('news-modal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
};

async function updateNotifBadge() {
  const q = query(collection(db, 'users', currentUid, 'notifications'));
  const snap = await getDocs(q);
  let unreadCount = 0;
  snap.forEach(d => { if (!d.data().read) unreadCount++; });

  const bellBtn = document.getElementById('btn-notif-bell');
  let badge = document.getElementById('notif-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'notif-badge';
    badge.className = 'absolute -top-1 -right-1 bg-amber-400 text-gray-900 text-xs font-black w-5 h-5 rounded-full flex items-center justify-center';
    bellBtn.appendChild(badge);
  }
  if (unreadCount > 0) {
    badge.innerText = unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ================= แชทผู้ซื้อ-ร้านค้า =================

let currentChatId = null;
let chatUnsubscribe = null; // เก็บ listener ไว้เพื่อยกเลิกตอนออกจากหน้าแชท

function getChatId(buyerUid, shopId) {
  return `${buyerUid}__${shopId}`; // deterministic ID ป้องกันสร้างแชทซ้ำ
}

async function openChatWithShop(shopId) {
  const shop = allShopsData[shopId];
  if (!shop) return;

  currentChatId = getChatId(currentUid, shopId);
  document.getElementById('chat-shop-name').innerText = shop.name;

  const chatRef = doc(db, 'chats', currentChatId);
  const chatDoc = await getDoc(chatRef);

  if (!chatDoc.exists()) {
    // สร้างห้องแชทใหม่ครั้งแรกที่คุยกับร้านนี้
    const userDoc = await getDoc(doc(db, 'users', currentUid));
    await setDoc(chatRef, {
      buyerUid: currentUid,
      shopId,
      buyerName: userDoc.data().name || 'ผู้ใช้งาน',
      shopName: shop.name,
      lastMessage: '',
      lastMessageAt: serverTimestamp()
    });
  }

  showView('chat-view');
  listenToChatMessages(currentChatId);
}
window.openChatWithShop = openChatWithShop;

function listenToChatMessages(chatId) {
  if (chatUnsubscribe) chatUnsubscribe(); // ยกเลิก listener เก่าก่อน กันซ้อนกัน

  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
  chatUnsubscribe = onSnapshot(q, (snap) => {
    const container = document.getElementById('chat-messages-container');
    if (snap.empty) {
      container.innerHTML = '<p class="text-center text-gray-400 text-base py-8">เริ่มต้นทักทายร้านค้าได้เลย</p>';
      return;
    }

    container.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const isMe = m.senderUid === currentUid;
      return `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[75%] ${isMe ? 'theme-pink text-white' : 'bg-white text-gray-800 border border-gray-100'} rounded-2xl px-4 py-2.5 text-base">
            ${m.text}
          </div>
        </div>`;
    }).join('');

    // เลื่อนไปข้อความล่าสุดเสมอ
    container.scrollTop = container.scrollHeight;
  });
}

document.getElementById('btn-back-chat').onclick = () => {
  if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
  showView('shop-view');
};

document.getElementById('btn-send-chat').onclick = async () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentChatId) return;

  input.value = '';

  try {
    await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
      senderUid: currentUid,
      senderRole: 'buyer',
      text,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'chats', currentChatId), {
      lastMessage: text,
      lastMessageAt: serverTimestamp()
    });
  } catch (err) {
    showToast('ส่งข้อความไม่สำเร็จ: ' + err.message, 'error');
    input.value = text; // คืนข้อความกลับให้พิมพ์ใหม่ได้
  }
};

// กด Enter ส่งข้อความได้เลย ไม่ต้องกดปุ่มอย่างเดียว
document.getElementById('chat-input').onkeypress = (e) => {
  if (e.key === 'Enter') document.getElementById('btn-send-chat').click();
};

document.getElementById('btn-chat-shop-page').onclick = () => openChatWithShop(currentShopIdViewing);

// ================= สิทธิ์เจ้าของร้าน =================

let myOwnedShopId = null;

async function checkShopOwnerStatus() {
  const userDoc = await getDoc(doc(db, 'users', currentUid));
  myOwnedShopId = userDoc.data().ownerOfShopId || null;
  document.getElementById('shop-owner-menu').classList.toggle('hidden', !myOwnedShopId);
}

document.getElementById('shop-owner-menu').onclick = () => {
  showView('shop-owner-dashboard-view');
  switchOwnerTab('info');
};
document.getElementById('btn-back-owner-dash').onclick = () => showView('account-view');

document.querySelectorAll('.owner-tab').forEach(tab => {
  tab.onclick = () => switchOwnerTab(tab.dataset.ownerTab);
});

async function switchOwnerTab(tabName) {
  document.querySelectorAll('.owner-tab').forEach(t => {
    t.className = 'owner-tab flex-1 py-3 text-base font-bold whitespace-nowrap px-4 text-gray-400 border-b-2 border-transparent';
  });
  document.querySelector(`[data-owner-tab="${tabName}"]`).className =
    'owner-tab flex-1 py-3 text-base font-bold whitespace-nowrap px-4 text-gray-800 border-b-2 border-gray-800';

  document.querySelectorAll('.owner-tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`owner-tab-${tabName}`).classList.remove('hidden');

  if (tabName === 'info') await loadShopInfoForm();
  else if (tabName === 'products') await loadOwnerProducts();
  else if (tabName === 'orders') await loadOwnerOrders();
  else if (tabName === 'chats') await loadOwnerChats();
}

// --- แท็บข้อมูลร้าน ---
async function loadShopInfoForm() {
  const shopDoc = await getDoc(doc(db, 'shops', myOwnedShopId));
  const shop = shopDoc.data();
  document.getElementById('own-shop-name').value = shop.name || '';
  document.getElementById('own-shop-description').value = shop.description || '';
}

document.getElementById('btn-save-shop-info').onclick = async () => {
  showLoading('กำลังบันทึกข้อมูลร้าน...');
  try {
    await updateDoc(doc(db, 'shops', myOwnedShopId), {
      name: document.getElementById('own-shop-name').value.trim(),
      description: document.getElementById('own-shop-description').value.trim()
    });
    showToast('บันทึกข้อมูลร้านสำเร็จ!', 'success');
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

// --- แท็บสินค้า: แก้ราคา/สต็อก/สินค้าแนะนำ ---
async function loadOwnerProducts() {
  const container = document.getElementById('owner-tab-products');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const snap = await getDocs(collection(db, 'products'));
  const myProducts = [];
  snap.forEach(d => { if (d.data().shopId === myOwnedShopId) myProducts.push({ id: d.id, ...d.data() }); });

  if (myProducts.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีสินค้าในร้าน</p>';
    return;
  }

  container.innerHTML = myProducts.map(p => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <h4 class="font-black text-gray-800 text-lg mb-2">${p.name}</h4>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label class="text-sm font-bold text-gray-400">ราคา (บาท)</label>
          <input type="number" class="form-input owner-price-input" data-pid="${p.id}" value="${p.price}">
        </div>
        <div>
          <label class="text-sm font-bold text-gray-400">สต็อก (ชิ้น)</label>
          <input type="number" class="form-input owner-stock-input" data-pid="${p.id}" value="${p.stock}">
        </div>
      </div>
      <label class="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" class="owner-featured-checkbox w-5 h-5" data-pid="${p.id}" ${p.isFeatured ? 'checked' : ''}>
        <span class="text-base font-bold text-gray-600">ตั้งเป็นสินค้าแนะนำ</span>
      </label>
      <button class="btn-save-product w-full bg-gray-800 text-white py-3 rounded-xl font-black text-base" data-pid="${p.id}">บันทึก</button>
    </div>
  `).join('');

  document.querySelectorAll('.btn-save-product').forEach(btn => {
    btn.onclick = async () => {
      const pid = btn.dataset.pid;
      const price = Number(document.querySelector(`.owner-price-input[data-pid="${pid}"]`).value);
      const stock = Number(document.querySelector(`.owner-stock-input[data-pid="${pid}"]`).value);
      const isFeatured = document.querySelector(`.owner-featured-checkbox[data-pid="${pid}"]`).checked;

      showLoading('กำลังบันทึกสินค้า...');
      try {
        await updateDoc(doc(db, 'products', pid), { price, stock, isFeatured });
        showToast('บันทึกสินค้าสำเร็จ!', 'success');
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
      } finally {
        hideLoading();
      }
    };
  });
}

// --- แท็บออเดอร์: อัปเดตสถานะ ---
const ownerOrderStatusOptions = ['pending_verify', 'preparing', 'shipping', 'completed'];

async function loadOwnerOrders() {
  const container = document.getElementById('owner-tab-orders');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const myOrders = [];
  snap.forEach(d => { if (d.data().shopId === myOwnedShopId) myOrders.push({ id: d.id, ...d.data() }); });

  if (myOrders.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีออเดอร์</p>';
    return;
  }

  container.innerHTML = myOrders.map(o => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <p class="text-sm text-gray-400 font-bold mb-1">คำสั่งซื้อ #${o.id.slice(0, 8)}</p>
      ${o.items.map(it => `<p class="text-base text-gray-700">${it.name} x${it.qty}</p>`).join('')}
      <p class="text-lg font-black theme-text mt-1 mb-3">฿${o.totalAmount.toLocaleString()}</p>
      <select class="form-input owner-order-status-select" data-oid="${o.id}">
        <option value="pending_payment" ${o.status === 'pending_payment' ? 'selected' : ''}>รอชำระเงิน</option>
        ${ownerOrderStatusOptions.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${orderStatusLabel[s]}</option>`).join('')}
      </select>
    </div>
  `).join('');

  document.querySelectorAll('.owner-order-status-select').forEach(sel => {
    sel.onchange = async () => {
      showLoading('กำลังอัปเดตสถานะ...');
      try {
        await updateDoc(doc(db, 'orders', sel.dataset.oid), { status: sel.value });
        showToast('อัปเดตสถานะสำเร็จ!', 'success');
      } catch (err) {
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
      } finally {
        hideLoading();
      }
    };
  });
}

// --- แท็บแชท: ร้านตอบลูกค้า ---
async function loadOwnerChats() {
  const container = document.getElementById('owner-tab-chats');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'));
  const snap = await getDocs(q);
  const myChats = [];
  snap.forEach(d => { if (d.data().shopId === myOwnedShopId) myChats.push({ id: d.id, ...d.data() }); });

  if (myChats.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีข้อความจากลูกค้า</p>';
    return;
  }

  container.innerHTML = myChats.map(c => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer" onclick="openOwnerChatReply('${c.id}', '${c.buyerName}')">
      <p class="font-black text-gray-800 text-base">${c.buyerName}</p>
      <p class="text-base text-gray-500 truncate">${c.lastMessage || '-'}</p>
    </div>
  `).join('');
}

function openOwnerChatReply(chatId, buyerName) {
  currentChatId = chatId;
  document.getElementById('chat-shop-name').innerText = buyerName; // ฝั่งร้านเห็นชื่อลูกค้าแทน
  showView('chat-view');
  listenToChatMessages(chatId);
}
window.openOwnerChatReply = openOwnerChatReply;

// --- แก้ btn-send-chat ให้รู้ว่าใครเป็นคนส่ง (ผู้ซื้อ หรือ ร้านค้า) ---
document.getElementById('btn-send-chat').onclick = async () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  input.value = '';

  const isOwnerReplying = myOwnedShopId && currentChatId.endsWith(`__${myOwnedShopId}`) && document.getElementById('shop-owner-dashboard-view').classList.contains('active') === false;

  try {
    await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
      senderUid: currentUid,
      senderRole: isOwnerReplying ? 'shop' : 'buyer',
      text,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'chats', currentChatId), { lastMessage: text, lastMessageAt: serverTimestamp() });
  } catch (err) {
    showToast('ส่งข้อความไม่สำเร็จ: ' + err.message, 'error');
    input.value = text;
  }
};