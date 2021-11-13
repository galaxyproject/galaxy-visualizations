importScripts("../KMiscFuns.js");
importScripts("../kmath.js");
importScripts("../KTools/KObject3DTool.js");
importScripts("../KView/KMedImageViewer.js");

self.addEventListener('message', function(e) {
	
	var execObj = e.data;
	if (e.data.message == 'createOctree')
	{
		var tracts = e.data.tracts;
	    KObject3DTool.unpackTracts(tracts);


		myOctree.fiberstep = math.ceil(tracts.tot_points/15000000);
		if (myOctree.fiberstep < 1 | myOctree.fiberstep == undefined) 
			myOctree.fiberstep = 1;

		if (myOctree.fiberstep >= 4)
			myOctree.fiberstep = 4;

		var octree = new myOctree(tracts.min,tracts.max,0);
		self.octree = octree;

		tracts.tracts.chunk( function(t,j){		 	
			octree.add(t,j);			
		 },512, 1, function(i) { self.postMessage({msg:'index_progress',detail:"building octree " + Math.round(100*i/tracts.tracts.length) + "%"}); },
			       function() { self.postMessage({msg:'index_progress'}) }	);

	}

	if (e.data.message == 'query')
	{
         var p = e.data.query 
         var radius = e.data.radius 
         var dirsel = e.data.dirsel;
         var qid = e.data.qid;

 		 var res = self.octree.findFibers(p,radius,dirsel);

   		 self.postMessage({msg:'query_done',selection:res,qid:qid},[]);
	}

	if (e.data.message == 'kill')
	{
		 self.close();
	}


}, false);

