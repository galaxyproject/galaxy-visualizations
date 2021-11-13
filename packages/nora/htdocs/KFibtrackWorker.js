importScripts("KMiscFuns.js");
importScripts("KView/KMedImageViewer.js");

importScripts("kmath.js");
importScripts("KTools/KObject3DTool.js");

self.addEventListener('message', function(e) {
	
	var execObj = e.data;
	if (e.data.message == 'trackvol')
	{
		self.nii = e.data.nii;
	}

	if (e.data.message == 'start')
	{
 		 var seeding = e.data.seeding;
 		 if (seeding.vol != undefined)
 		 {
			 if (seeding.vol == 'last')
				seeding.vol = self.lastSeedingVol;
			 else
			 	self.lastSeedingVol = seeding.vol;
 		 } 		 	
		 var ret = realtimeTracking(seeding,self.nii,e.data.params);
   		 self.postMessage({msg:'tracts',result:ret},[]);
	}

	if (e.data.message == 'kill')
	{
		 self.close();
	}


}, false);

