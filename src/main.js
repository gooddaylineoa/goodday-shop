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
    await loadProducts();
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
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer" onclick="openShopPage('${p.shopId}')">
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