importScripts('KView/pako.js');
importScripts('KMiscFuns.js');

self.addEventListener('message', function(e) {
    var obj = e.data;
    var fileID = obj.fileID;
    var buffer = obj.buffer;    
    var userinfo = obj.userinfo;
    var projectInfo = obj.projectInfo;
    var myownurl = obj.myownurl;
	var finfo = obj.finfo;

	// pack the file as blob
	var x = new Uint8Array(buffer);
	if (obj.deflate)
	{
 	   self.postMessage({msg:'packing ' + finfo.Filename});
	   x = pako.gzip(x);
	}
	if (obj.inflate)
	{
 	   self.postMessage({msg:'unpacking ' + finfo.Filename});
 	   try {
	   	 x = pako.inflate(x);
 	   }
	   catch (e)
	   {
	     self.postMessage({msg:'warning',err:e});
	     return;
	   }

	}
	saveArrayBuffer(x);

	function saveArrayBuffer(x)
	{

		var blob = new Blob([x],{type: 'application/octet-binary'});
		var xhr = new XMLHttpRequest();
		var formData = new FormData();


		// send the post
		formData.append("theROI", blob);
		formData.append("theROIinfo", JSON.stringify(finfo));

		xhr.upload.addEventListener('progress', function(finfo) { return function(e){
  			self.postMessage({msg: 'uploading ' + finfo.Filename + " " + Math.ceil(e.loaded/e.total * 100 )+ '%'});
		} }(finfo), false);

		xhr.open('post', myownurl + "?asuser=" + userinfo.username + "&project="+ projectInfo.name);
		xhr.send(formData);
		xhr.onload = function(finfo) { return function(e)
			{
  			self.postMessage({msg:'done',response:e.target.response});
  			self.close();
		}  }(finfo);

	}

}, false);


