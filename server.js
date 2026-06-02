<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Graphic Design | DAN74TECH MEDIA</title>

<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">

<style>

:root{
    --primary-blue:#0044ff;
    --deep-blue:#0022aa;
    --accent-yellow:#ffd700;
    --accent-red:#ff2a2a;
    --bg:#f4f7f6;
    --success:#2e7d32;
    --text:#222;
}

body{
    margin:0;
    font-family:Poppins,sans-serif;
    background:var(--bg);
    color:var(--text);
}

/* HEADER */
header{
    background:linear-gradient(135deg,var(--primary-blue),var(--deep-blue));
    color:white;
    text-align:center;
    padding:50px 20px;
}

.logo{width:90px}

/* NAV */
nav{
    background:var(--deep-blue);
    text-align:center;
    padding:14px;
    position:sticky;
    top:0;
    z-index:1000;
}

nav a{
    color:white;
    margin:0 15px;
    text-decoration:none;
    font-weight:600;
}

/* CONTAINER */
.container{
    max-width:950px;
    margin:30px auto;
    background:white;
    padding:40px;
    border-radius:18px;
    box-shadow:0 10px 30px rgba(0,0,0,0.08);
}

/* GRID (same system as web page) */
.packages{
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
    gap:20px;
    margin:20px 0;
}

.card{
    background:#f9f9f9;
    padding:20px;
    border-left:5px solid var(--primary-blue);
    border-radius:12px;
}

/* FORM */
.form-box{
    margin-top:30px;
    border:1px solid #eee;
    padding:25px;
    border-radius:15px;
}

input,select,textarea{
    width:100%;
    padding:12px;
    margin:8px 0;
    border-radius:8px;
    border:1px solid #ddd;
}

/* MPESA */
.mpesa{
    background:#e8f5e9;
    border:2px dashed var(--success);
    padding:20px;
    border-radius:12px;
    text-align:center;
}

#displayPrice{
    font-size:2rem;
    font-weight:bold;
    color:var(--success);
}

/* BUTTON (MATCH WEB STYLE EXACTLY) */
button{
    width:100%;
    padding:15px;
    border:none;
    background:var(--success);
    color:white;
    border-radius:30px;
    font-weight:bold;
    cursor:pointer;
    transition:0.3s;
}

button:hover{
    background:#1b5e20;
}

/* FOOTER */
footer{
    background:#111;
    color:white;
    text-align:center;
    padding:30px;
    margin-top:40px;
}

</style>
</head>

<body>

<header>
    <img src="images/logo.png" class="logo">
    <h1>Graphic Design Studio</h1>
</header>

<nav>
    <a href="index.html">Home</a>
    <a href="about.html">About</a>
    <a href="services.html">Services</a>
    <a href="contact.html">Contact</a>
</nav>

<div class="container">

<h2 style="text-align:center;color:var(--primary-blue);">
Creative Branding & Graphic Solutions
</h2>

<!-- PACKAGES (FROM DB LIKE WEB PAGE) -->
<div class="packages" id="packagesContainer"></div>

<!-- FORM -->
<div class="form-box">

<h3>Place Graphic Design Order</h3>

<label>Full Name</label>
<input id="userName">

<label>Select Package</label>
<select id="serviceType" onchange="updatePrice()"></select>

<label>Design Instructions</label>
<textarea id="userDesc"></textarea>

<div class="mpesa">

<p><b>M-PESA PAY</b></p>
<p>0790 435 584</p>

<p>Total Cost</p>
<div id="displayPrice">KSH 0</div>

<button onclick="sendToWhatsApp()">
Confirm & Continue
</button>

</div>

</div>

</div>

<footer>© 2026 DAN74TECH MEDIA</footer>

<script>

let services = [];

/* SAME BACKEND PATTERN AS WEB PAGE */
async function loadServices(){
    try{
        const res = await fetch('/api/sub-services/graphics');
        services = await res.json();

        const container = document.getElementById('packagesContainer');
        const select = document.getElementById('serviceType');

        container.innerHTML = '';
        select.innerHTML = '';

        services.forEach(s => {

            container.innerHTML += `
            <div class="card">
                <h3>${s.title}</h3>
                <p>${s.description}</p>
            </div>`;

            select.innerHTML += `
            <option value="${s.title}" data-price="${s.price}">
                ${s.title} - KSH ${s.price}
            </option>`;
        });

        updatePrice();

    } catch(err){
        console.log("Failed loading graphics services", err);
    }
}

/* SAME PRICE SYSTEM */
function updatePrice(){
    const select = document.getElementById('serviceType');
    const price = select.options[select.selectedIndex]?.dataset.price || 0;
    document.getElementById('displayPrice').innerText = `KSH ${price}`;
}

/* SAME WHATSAPP ORDER SYSTEM */
function sendToWhatsApp(){

    const name = document.getElementById('userName').value;
    const service = document.getElementById('serviceType').value;
    const desc = document.getElementById('userDesc').value;
    const price = document.getElementById('displayPrice').innerText;

    if(!name){
        alert("Enter your name");
        return;
    }

    const msg =
`*GRAPHIC DESIGN ORDER*
Customer: ${name}
Service: ${service}
Price: ${price}
Instructions: ${desc}`;

    window.open(
        `https://wa.me/254790435584?text=${encodeURIComponent(msg)}`,
        '_blank'
    );
}

loadServices();

</script>

</body>
</html>
