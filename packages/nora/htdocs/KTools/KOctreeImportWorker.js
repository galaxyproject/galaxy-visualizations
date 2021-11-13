importScripts("../KMiscFuns.js");
importScripts("../kmath.js");
importScripts("../KTools/KObject3DTool.js");
importScripts("../KView/KMedImageViewer.js");
importScripts("../sparc.js");

self.addEventListener('message', function(e) {
	
	var execObj = e.data;
	if (e.data.message == 'import')
	{
        var fun = worker_importTCK
        if (e.data.typ == "TRK")
           fun = worker_importTRK

        fun(e.data.buffer,function(e)
        {
           self.postMessage({msg:'index_progress',detail: e});     	
        },
        function(tracts)
        {
            self.postMessage({msg:'index_progress',detail:"computing checksum"})
 		    var md5;
 		    var startbuf = e.data.buffer.slice(0,5000)
 		    md5 = SparkMD5.ArrayBuffer.hash(startbuf);
 		    delete e.data.buffer;
            
            if (tracts == undefined)
            {
				self.postMessage({msg:'import_failed' })
				return;
            }


    	    self.postMessage({msg:'import_done',   md5:md5,  	                          
    	                             tracts:worker_packTractsForTransfer({content:tracts})    	                           
    	                      },
    	                      []);

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
        })


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



worker_packTractsForTransfer = function(tracts)
{
	function rmchnk(a)
	{
		return a;
	}

//	var tracts_data = tracts.content.tracts;
//	if (tracts_data != undefined)
//		tracts_data = tracts_data.slice(0);

	return {tract_buffer: tracts.content.tract_buffer, 
			tot_points:tracts.content.tot_points,
			tracts_len:tracts.content.tracts_len, 
			tracts_min:rmchnk(tracts.content.tracts_min),
			tracts_max:rmchnk(tracts.content.tracts_max),
			tracts:rmchnk(tracts.content.tracts),
			max:rmchnk(tracts.content.max),
			min:rmchnk(tracts.content.min)};
}


function worker_importTCK(uint8Response,processinfo,arrived)
{
	  
	  var view = new DataView(uint8Response.buffer);
	  var hdr = view.getUTF8String(0,1024);
	  var toks = hdr.split('\n');
	  if (toks[0].trim() == 'mrtrix tracks')
	  {
		 var header = {};
		 for (var k = 0; k < toks.length-1;k++)
		 {
			if (toks[k+1].search("^datatype:") >=0)
				header.datatype = toks[k+1].substring(9).trim();
			else if (toks[k+1].search("^count:") >=0)
				header.count = parseInt(toks[k+1].substring(7));
			else if (toks[k+1].search("^file:")>=0)
				header.offset = parseInt(toks[k+1].substring(7));
		 }

         if (header.count == 0 | header.count == undefined)
         {
         	arrived()
         	return;
         }

		 var LE = true;

		 var pos = 0;
		 var tot_points = 0;

		 var max = [-100000,-100000,-100000];
		 var min = [100000,100000,100000];

		 var tmax = [-100000,-100000,-100000];
		 var tmin = [100000,100000,100000];


		 var dummy = new Array(header.count);
		 var tract_buffer = new Float32Array((uint8Response.byteLength-header.offset-header.count*4)/4);

		 var tracts = [];
		 var tracts_max = new Float32Array(header.count*3);
		 var tracts_min = new Float32Array(header.count*3);

		 var tracts_len = new Float32Array(header.count);


		 var tractlen = 0;
		 var totlen = 0;
		 var tract_cnt = 0;

		 dummy.chunk(function(el,j,arr)
			{
				 var tract = [];
				 var pos = arr.pos;
				 if (pos == undefined) pos = 0;

				 while(true)
				 {
					var val = view.getFloat32(header.offset+4*pos,LE);
					//if (pos%3==0)
					//	val += 1700;
					if (max[pos%3] < val) max[pos%3] = val;
					if (min[pos%3] > val) min[pos%3] = val;
					if (tmax[pos%3] < val) tmax[pos%3] = val;
					if (tmin[pos%3] > val) tmin[pos%3] = val;

					if (!isNaN(val))
					{
						tract.push(val);
						pos++;
						tot_points++;
						tractlen++;
					}
					else
					{
						pos+=3;
						tracts_max[3*tract_cnt] =(tmax[0]);
						tracts_max[3*tract_cnt+1] =(tmax[1]);
						tracts_max[3*tract_cnt+2] =(tmax[2]);
						tracts_min[3*tract_cnt] =(tmin[0]);
						tracts_min[3*tract_cnt+1] =(tmin[1]);
						tracts_min[3*tract_cnt+2] =(tmin[2]);
						tmax = [-100000,-100000,-100000];
						tmin = [100000,100000,100000];						
						tracts_len[tract_cnt] = (tractlen/3);					
						tract_buffer.set(tract,totlen);
						var tmp = new Float32Array(tract_buffer.buffer,totlen*4,tractlen);
						tracts.push(tmp);

						totlen += tractlen;
						tract_cnt++;
					

						tractlen = 0;
					//	start = 0;
					//	tracts.push(new Float32Array(uint8Response.buffer,header.offset+4*(start),pos-start));
						break;
					}
				 }	
				 arr.pos = pos;

			},1024*4,0,
			function(i)
			{ 
			  processinfo("reading tcks " + math.round(i/header.count*100) +"%");
			},
			function()
			{
			  var content;
			  if (tracts.length>0)
			  {
/*
				for (var k = 0; k < tracts.length; k++)
				{
					tracts[k] =  reparam_track_constPcnt(tracts[k],undefined,5);
					//tracts[k] = reparam_track(tracts[k],20 );
				}
*/


				var content = {tracts:tracts,   // these are just pointer on tract_buffer
									tract_buffer:tract_buffer,
									tracts_len:tracts_len,
									tot_points:tot_points,
									octree:new myOctree(min,max,0),
									tracts_max:tracts_max,tracts_min:tracts_min,
									min:min,max:max,
									buffer:uint8Response.buffer};
			  }
			   arrived(content);

			});
	  }
}


function worker_importTRK(uint8Response,processinfo,arrived)
{
	  
	  var view = new DataView(uint8Response.buffer);
	  if (ab2str(uint8Response.slice(0,5)) == "TRACK")
	  {
		 var header = {};

		 var LE = true;
		  header.offset = 1000;
		
          header.n_scalars = view.getUint16(36,LE);
          header.n_props = view.getUint16(238,LE);
          header.count = view.getInt32(988,LE);

          if (header.count == 0)
          {
          	  arrived()
          	  return;
          }

          header.voxSize = view.getFloat32(12,LE);

		  var vox_to_ras = math.diag([0,0,0,0]);
		  for (var k = 0; k < 16;k++)
		  	    vox_to_ras._data[math.floor(k/4)][k%4] = view.getFloat32(440+k*4,LE);
		  var e = vox_to_ras._data;
		  if (e[3][3] == 0)
		  	e = undefined;

		  var ie = math.inv(vox_to_ras)._data;


		 var pos = 0;
		 var tot_points = 0;

		 var max = [-100000,-100000,-100000];
		 var min = [100000,100000,100000];

		 var tmax = [-100000,-100000,-100000];
		 var tmin = [100000,100000,100000];


		 var dummy = new Array(header.count);
		 var tract_buffer = new Float32Array((uint8Response.byteLength-header.offset-header.count*4)/4);

		 var tracts = [];
		 var tracts_max = new Float32Array(header.count*3);
		 var tracts_min = new Float32Array(header.count*3);

		 var tracts_len = new Float32Array(header.count);


		 var tractlen = 0;
		 var totlen = 0;
		 var tract_cnt = 0;

		 dummy.chunk(function(el,j,arr)
			{
				var tract = [];
				var pos = arr.pos;
				if (pos == undefined) pos = 1000;


				var num_p = view.getInt32(pos,LE); pos+=4;

				var c = [0,0,0];
				for (var k = 0; k < num_p;k++)
				{
					for (var j = 0; j < 3;j++)
					{
						c[j] =  (view.getFloat32(pos,LE))+1;
						pos += 4;
						tot_points++;
						tractlen++;

					}

					c[0]  = c[0] / header.voxSize;
					c[1]  = c[1] / header.voxSize;
					c[2]  = c[2] / header.voxSize;
					for (var j = 0; j < 3;j++)
					{
						var val;
						if (e)						 	
						 	val = (e[j][0]*c[0]+e[j][1]*c[1]+e[j][2]*c[2]+e[j][3]);
						else
					 		val = c[j];
					 	//if (j==0) val = -val;
						if (max[j] < val) max[j] = val;
						if (min[j] > val) min[j] = val;
						if (tmax[j] < val) tmax[j] = val;
						if (tmin[j] > val) tmin[j] = val;

						tract.push(val);
					}
				}


				tracts_max[3*tract_cnt] =(tmax[0]);
				tracts_max[3*tract_cnt+1] =(tmax[1]);
				tracts_max[3*tract_cnt+2] =(tmax[2]);
				tracts_min[3*tract_cnt] =(tmin[0]);
				tracts_min[3*tract_cnt+1] =(tmin[1]);
				tracts_min[3*tract_cnt+2] =(tmin[2]);
				tmax = [-100000,-100000,-100000];
				tmin = [100000,100000,100000];						
				tracts_len[tract_cnt] = (tractlen/3);					
				tract_buffer.set(tract,totlen);
				var tmp = new Float32Array(tract_buffer.buffer,totlen*4,tractlen);
				tracts.push(tmp);

				totlen += tractlen;
				tract_cnt++;					
				tractlen = 0;



				arr.pos = pos;

			},1024*4,0,
			function(i)
			{ 
			  processinfo("reading " + math.round(i/header.count*100) +"%");
			},
			function()
			{
			  var content
			  if (tracts.length>0)
			  {

				  content = {tracts:tracts,   // these are just pointer on tract_buffer
									tract_buffer:tract_buffer,
									tracts_len:tracts_len,
									tot_points:tot_points,
									octree:new myOctree(min,max,0),
									tracts_max:tracts_max,tracts_min:tracts_min,
									min:min,max:max,
									buffer:uint8Response.buffer};
			  }
			   arrived(content);

			});
	  }
	  else
	      arrived();
}

