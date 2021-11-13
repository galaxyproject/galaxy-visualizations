importScripts('KView/pako.js');
importScripts('KMiscFuns.js');

self.addEventListener('message', function(e) {
	try
	{
		var x = pako.inflate(e.data,{progress:
		function(perc) { self.postMessage({msg:'unpacking '+(100*perc).toFixed(0)+"%"}); }	});
	}
	catch(err)
	{
		if (err.message != undefined)
		    self.postMessage({msg:'error',error:{message:err.message,stack:err.stack }});
		else
		    self.postMessage({msg:'error',error:{message:err,stack:undefined }});
		self.close();
		return;
	}
    self.postMessage({msg:'done',arraybuf: x, back:e.data },[x.buffer,e.data]);


  	self.close();

}, false);


