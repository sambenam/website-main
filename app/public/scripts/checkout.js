let CHECKOUT_TOTAL = 49000;

document.addEventListener("DOMContentLoaded", () => {
  // Dynamically calculate total from hesabyarCart
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem("hesabyarCart") || "[]");
  } catch (error) {
    cart = [];
  }

  if (Array.isArray(cart) && cart.length > 0) {
    CHECKOUT_TOTAL = cart.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (item.qty || 1),
      0,
    );
  } else {
    CHECKOUT_TOTAL = 0;
  }

  renderCheckoutItems();

  const discountInput = document.getElementById("discountInput");
  const discountButton = document.getElementById("discountBtn");
  const discountRow = document.getElementById("discountRow");
  const discountAmount = document.getElementById("discountAmount");
  const subtotalPrice = document.getElementById("cartSubtotalPrice");
  const finalPrice = document.getElementById("cartFinalPrice");
  let finalAmount = CHECKOUT_TOTAL;

  const formatMoney = (value) =>
    `${Number(value).toLocaleString("fa-IR")} تومان`;

  if (subtotalPrice) {
    subtotalPrice.textContent = formatMoney(CHECKOUT_TOTAL);
  }
  if (finalPrice) {
    finalPrice.textContent = formatMoney(finalAmount);
  }

  const showMessage = (message, type) => {
    let messageEl = document.querySelector(".checkout-message");
    if (!messageEl) {
      messageEl = document.createElement("p");
      messageEl.className = "checkout-message";
      discountInput.closest(".form-group").after(messageEl);
    }
    messageEl.textContent = message;
    messageEl.dataset.type = type || "info";
  };

  sessionStorage.setItem(
    "hesabyarCheckout",
    JSON.stringify({ total: CHECKOUT_TOTAL, finalAmount }),
  );

  discountButton?.addEventListener("click", async () => {
    const code = discountInput.value.trim();
    if (!code) {
      showMessage("کد تخفیف را وارد کنید.", "error");
      return;
    }

    discountButton.disabled = true;
    try {
      const result = await appApi.commerce.validateCoupon({ code });
      const discount = Math.round((CHECKOUT_TOTAL * result.percent) / 100);
      finalAmount = CHECKOUT_TOTAL - discount;
      discountRow.hidden = false;
      discountAmount.textContent = formatMoney(discount);
      finalPrice.textContent = formatMoney(finalAmount);
      sessionStorage.setItem(
        "hesabyarCheckout",
        JSON.stringify({
          total: CHECKOUT_TOTAL,
          finalAmount,
          code: result.code,
        }),
      );
      showMessage(result.message, "success");
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      discountButton.disabled = false;
    }
  });

  // Handle Checkout Form Submission (Billing Form)
  const checkoutForm = document.getElementById("checkoutForm");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = document.getElementById("billingName").value.trim();
      const phone = document.getElementById("billingPhone").value.trim();
      const email = document.getElementById("billingEmail").value.trim();

      if (!name || !phone || !email) {
        alert("لطفاً کلیه مشخصات خریدار را به درستی پر کنید.");
        return;
      }

      // Save buyer info to retrieve on receipt page
      localStorage.setItem("irHesabdarBuyerName", name);
      localStorage.setItem("irHesabdarBuyerPhone", phone);
      localStorage.setItem("irHesabdarBuyerEmail", email);

      // Carry the buyer and the cart forward so the payment call can record a
      // complete order - including when the payment fails and there is no
      // receipt page to pick up the pieces.
      let cart = [];
      try {
        cart = JSON.parse(localStorage.getItem("hesabyarCart") || "[]");
      } catch (error) {
        cart = [];
      }

      let checkout = {};
      try {
        checkout = JSON.parse(
          sessionStorage.getItem("hesabyarCheckout") || "{}",
        );
      } catch (error) {
        checkout = {};
      }

      sessionStorage.setItem(
        "hesabyarCheckout",
        JSON.stringify({
          ...checkout,
          buyer: { name, phone, email },
          // qty was dropped here, so a basket of two copies was recorded as
          // one: the bestsellers report under-counted and the line items no
          // longer added up to the amount charged.
          items: Array.isArray(cart)
            ? cart.map((i) => ({
                id: i.id,
                name: i.name,
                price: Number(i.price) || 0,
                qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
              }))
            : [],
        }),
      );

      // Redirect to Gateway
      window.location.href = "/gateway";
    });
  }
});

function renderCheckoutItems() {
  const container = document.querySelector(".cart-items-list");
  if (!container) return;

  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem("hesabyarCart") || "[]");
  } catch (error) {
    cart = [];
  }

  if (!Array.isArray(cart) || !cart.length) return;

  container.replaceChildren();
  cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    const image = document.createElement("img");
    image.src = item.img || "../images/ravin.png";
    image.alt = item.name || "محصول";
    const info = document.createElement("div");
    info.className = "cart-item-info";
    const title = document.createElement("h4");
    title.textContent = item.name || "محصول بدون نام";
    const price = document.createElement("p");
    price.className = "price";
    price.textContent = `${Number(item.price || 0).toLocaleString("fa-IR")} تومان (تعداد: ${item.qty || 1})`;
    info.append(title, price);
    row.append(image, info);
    container.appendChild(row);
  });
}
