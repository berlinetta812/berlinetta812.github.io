const assetInput = document.querySelector('#asset-input');
const assetRange = document.querySelector('#asset_range');
const inputPercent = document.querySelector ('#inputPercent');
const percentRange = document.querySelector ('#percent_range');
const monthInput = document.querySelector('#month-input');
const monthRange = document.querySelector('#month-range');
const totalAmount = document.querySelector ('#total_assets');

const inputs = document.querySelectorAll ('input');

// Размер вклада

assetRange.addEventListener('input', function () {
    assetInput.value = assetRange.value;
})

assetInput.addEventListener('input', function () {
    assetRange.value = assetInput.value;
})

// Процент вклада

percentRange.addEventListener ('input', function () {
    inputPercent.value = percentRange.value
})

inputPercent.addEventListener ('input', function () {
    percentRange.value = inputPercent.value
})

// Срок вклада

monthRange.addEventListener ('input', function () {
    monthInput.value = monthRange.value
})

monthInput.addEventListener ('input', function () {
    monthRange.value = monthInput.value
})

// Калькулятор

let totalAssets = parseInt(assetInput.value) + (parseInt(assetInput.value)*(parseInt(inputPercent.value)/100/12)*parseInt(monthInput.value))

function calculate () {
    totalAssets = parseInt(assetInput.value) + (parseInt(assetInput.value)*(parseInt(inputPercent.value)/100/12)*parseInt(monthInput.value))
    const roundedAmount = Math.round(totalAssets);
    const formatter = new Intl.NumberFormat('ru');
    totalAmount.innerText = formatter.format(roundedAmount);
    
}

calculate ();

for (const input of inputs) {
    input.addEventListener('input', function () {
        calculate ();
    })
}

