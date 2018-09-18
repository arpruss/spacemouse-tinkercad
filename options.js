var numericOptions = {fps:30, nudgeFirstRepeat:250, nudgeNextRepeat:75,
	nudgeAxis:0.3,nudgeHysteresisRatio:0.67}
	
var storage = chrome.storage.local
	
function loadOptions() {
	storage.get(numericOptions, function(result) {
		for (key in numericOptions) {
			console.log("loaded",key,result[key])
			document.getElementById(key).value = result[key]
		}
	})
}

function clamp(x,a,b) {
	x = parseFloat(x)
	if (x < parseFloat(a))
		return parseFloat(a)
	else if (x > parseFloat(b))
		return parseFloat(b)
	else
		return x
}

function saveOptions() {
	var out = {}
	for (var key in numericOptions) {
		var opt = document.getElementById(key)		
		out[key] = clamp(opt.value,opt.min,opt.max)
		console.log("trying to save",key,out[key])
	}
	storage.set(out, function() {loadOptions()})	
}

function defaults() {
	for (var key in numericOptions) {
		var opt = document.getElementById(key)
		opt.value = numericOptions[key]
	}
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('save').addEventListener('click',
    saveOptions);
document.getElementById('defaults').addEventListener('click',
    defaults);
	