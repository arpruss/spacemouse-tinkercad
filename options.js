var options = {fps:30, nudgeAngle:22.5, nudgeFirstRepeat:250, nudgeNextRepeat:75,
	nudgeAxis:0.3, nudgeHysteresisRatio:0.67, fly:false, swapYZ:false, navSelection:"3",
	navRotationally:"2", navPositionally:"1", fit:"4", home:"5", fineNudge:"9"}
	
var storage = chrome.storage.local
var changed = false
	
function loadOptions() {
	storage.get(options, function(result) {
		for (key in options) {
			console.log("loaded",key,result[key])
			var e = document.getElementById(key)
			if (e.tagName == 'SELECT')
				e.value = result[key]
			if (e.type == 'checkbox')
				e.checked = result[key]
			else
				e.value = result[key]
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
	for (var key in options) {
		var opt = document.getElementById(key)
		if (opt.type == 'checkbox')
			out[key] = opt.checked
        else if (opt.type == 'number')
            out[key] = clamp(opt.value,opt.min,opt.max)
        else
            out[key] = opt.value
	}
	storage.set(out, function() {
        document.getElementById('save').disabled = true
        changed = false
        loadOptions()
		document.getElementById('message').innerHTML = 'Refresh TinkerCAD to use new settings.'
    }
    )	
}

function change() {
    if (! changed) {
        document.getElementById('save').disabled = false
        changed = true
    }
}

function defaults() {
	for (var key in options) {
		var opt = document.getElementById(key)
        if (opt.value != options[key]) {
            opt.value = options[key]
            change()
        }
	}
}

document.addEventListener('DOMContentLoaded', loadOptions)
document.getElementById('save').addEventListener('click',
    saveOptions)
document.getElementById('defaults').addEventListener('click',
    defaults)
for (var key in options) {
    document.getElementById(key).addEventListener('change', function() { change() })
    document.getElementById(key).addEventListener('keyup', function() { change() })
    document.getElementById(key).addEventListener('paste', function() { change() })
}
