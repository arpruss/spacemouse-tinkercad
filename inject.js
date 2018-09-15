// based on https://gist.github.com/nok/a98c7c5ce0d0803b42da50c4b901ef84    
var body = document.getElementsByTagName('body')[0];
var script = document.createElement('script');
script.setAttribute('type', 'text/javascript');
script.setAttribute('src', chrome.extension.getURL('content.js'));
body.appendChild(script);
