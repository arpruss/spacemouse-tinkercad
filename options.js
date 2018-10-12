var storage = chrome.storage.local
var changed = false
	
function showHide() {
	var generic = document.getElementById('generic')
	document.getElementById('generic_setup').style.display = generic.checked ? "block" : "none"
}
	
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
		showHide()
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
	showHide()
}

document.addEventListener('DOMContentLoaded', loadOptions)
document.getElementById('save').addEventListener('click',
    saveOptions)
document.getElementById('defaults').addEventListener('click',
    defaults)
for (var key in options) {
    if (key == 'generic') {
		document.getElementById(key).addEventListener('change', function() { change(); showHide() })
	}
	else
		document.getElementById(key).addEventListener('change', function() { change() })
    document.getElementById(key).addEventListener('keyup', function() { change() })
    document.getElementById(key).addEventListener('paste', function() { change() })
}
