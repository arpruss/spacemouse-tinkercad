// based on https://gist.github.com/nok/a98c7c5ce0d0803b42da50c4b901ef84    
var body = document.getElementsByTagName('body')[0];
var script = document.createElement('script');
script.setAttribute('type', 'text/javascript');
script.setAttribute('src', chrome.extension.getURL('toast.js'));
body.appendChild(script);
var mainScript = document.createElement('script');
mainScript.setAttribute('type', 'text/javascript');
mainScript.setAttribute('src', chrome.extension.getURL('content.js'));
mainScript.setAttribute('id', 'tinkerCADPatch_SpaceMouse')
body.appendChild(mainScript);
var numericOptions = {fps:30, nudgeFirstRepeat:250, nudgeNextRepeat:75,
	nudgeAxis:0.3,nudgeHysteresisRatio:0.67}
chrome.storage.local.get(numericOptions, function(results){
	console.log("Options",results)
	mainScript.setAttribute('data-options', JSON.stringify(results))
})
