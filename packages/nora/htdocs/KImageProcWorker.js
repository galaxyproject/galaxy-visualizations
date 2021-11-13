
importScripts('KMiscFuns.js');
importScripts('KView/KMedImageViewer.js');
importScripts('kmath.js');


self.addEventListener('message', function(e) {
	
	var execObj = e.data;

	if (execObj.msg == 'kill')
	{
		self.close();
	}
	if (execObj.func == 'createFiberVisitMap')
	{
		if (execObj.lines == undefined)
			execObj.lines = self.lines;
		else
			self.lines = execObj.lines;
		createFiberVisitMap(execObj,function(perc){self.postMessage({msg:'rendering visits '+(100*perc).toFixed(0)+"%"}) })
		self.postMessage({msg:'done',execObj:execObj},[execObj.buffer]);
	}
	else if (execObj.func == 'createISOSurf')
	{
		var res = computeIsoSurf(execObj,function(perc){self.postMessage({msg:'rendering isosurface '+(100*perc).toFixed(0)+"%"}) })
		self.postMessage({msg:'done',execObj:res},[]);
	}
	else if (execObj.func == 'atlasToRoi')
	{
		atlasToRoi(execObj,function(perc){self.postMessage({msg:'rendering isosurface '+(100*perc).toFixed(0)+"%"}) })
		self.postMessage({msg:'done',execObj:{buffer:execObj.img.buffer}},[execObj.img.buffer]);
	}
	else if (execObj.func == 'fillholes')
	{
		var res = fillholes(execObj.data,execObj.size)
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:res.changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'removesalt')
	{
		var changedPoints = removesalt(execObj.data,execObj.size,execObj.threshold)
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'invert')
	{
		var tot = 1
		for (var k = 0; k < execObj.size.length;k++)
		   tot *= execObj.size[k]
		var changedPoints = [];
		for (var k = 0; k < tot;k++)
		{
		    if (execObj.data[k] > 0)
		        execObj.data[k] = 0;
		    else
		        execObj.data[k] = 1;
		    changedPoints.push(k);
		}
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'clean')
	{
		var tot = 1
		for (var k = 0; k < execObj.size.length;k++)
		   tot *= execObj.size[k]
		for (var k = 0; k < tot;k++)
		    if (execObj.data[k] > 0)
		        execObj.data[k] = 1;
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:[]}},[execObj.buf]);		
	}
	else if (execObj.func == 'erode')
	{
		var changedPoints = erode(execObj.data,execObj.size)
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'dilate')
	{
		var changedPoints = dilate(execObj.data,execObj.size)
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'opening')
	{            
		var A = erode(execObj.data, execObj.size);
		var B = dilate(execObj.data, execObj.size);
		A = array_to_setObject(A)
		B = array_to_setObject(B)
		var C = diff(A,B)
		C = union(C,diff(B,A))
		var changedPoints = Object.keys(C);
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'closing')
	{            
		var A = erode(execObj.data, execObj.size);
		var B = dilate(execObj.data, execObj.size);
		A = array_to_setObject(A)
		B = array_to_setObject(B)
		var C = diff(A,B)
		C = union(C,diff(B,A))
		var changedPoints = Object.keys(C);
		self.postMessage({msg:'done',execObj:{buf:execObj.buf,changedPoints:changedPoints}},[execObj.buf]);		
	}
	else if (execObj.func == 'conncomp')
	{
		var res = bwconncomp(execObj.data, execObj.size, function(x) { return x>0 }, execObj.clustthres)
		self.postMessage({msg:'done',execObj:res},[res.labels.buffer]);
	}

	if (!execObj.keepOpen)
  		self.close();

}, false);




function removesalt(data, size, thres)
{
    var res = bwconncomp(data, size , function (x) { return x>0;},  thres , data)
    return res.changedPoints;
}



function dilate(data, size)
{

    var changedPoints = [];
    var tmp = new Uint8Array(data);
    var w = size[0];
    var h = size[1];
    var wh = size[0] * size[1];
    var whd = size[0] * size[1] * size[2];

    for (var z = 0; z < size[2]; z++)
        for (var y = 0; y < size[1]; y++)
            for (var x = 0; x < size[0]; x++)
            {
                var idx = x + w * y + wh * z;
                if (tmp[idx] > 0 | tmp[idx + 1] > 0 | tmp[idx - 1] > 0 | tmp[idx + w] > 0 | tmp[idx - w] > 0 | tmp[idx + wh] > 0 | tmp[idx - wh] > 0)
                {
                    if (data[idx] == 0)
                        changedPoints.push(idx);
                    data[idx] = 1;
                }
            }
    return changedPoints;
}


function erode(data, size)
{
    var changedPoints = [];
    var tmp = new Uint8Array(data);
    var w = size[0];
    var h = size[1];
    var wh = size[0] * size[1];
    var whd = size[0] * size[1] * size[2];

    for (var z = 0; z < size[2]; z++)
        for (var y = 0; y < size[1]; y++)
            for (var x = 0; x < size[0]; x++)
            {
                var idx = x + w * y + wh * z;
                if (!(tmp[idx] > 0 & (tmp[idx + 1] > 0 | x == size[0] - 1)
                & (tmp[idx - 1] > 0 | x == 0)
                & (tmp[idx + w] > 0 | y == size[1] - 1)
                & (tmp[idx - w] > 0 | y == 0)
                & (tmp[idx + wh] > 0 | z == size[2] - 1)
                & (tmp[idx - wh] > 0 | z == 0)))
                {
                    if (data[idx] == 1)
                        changedPoints.push(idx);
                    data[idx] = 0;
                }
            }
    return changedPoints;

}




function fillholes(data,size)
{
	var tmp = new Uint8Array(size[0] * size[1] * size[2]);
	floodfill(data, tmp, size, [0, 0, 0]);
	changedPoints = [];
	for (var k = 0; k < size[0] * size[1] * size[2]; k++)
	{
		var newval = tmp[k] <= 0;
		if (newval != data[k])
		{
			data[k] = newval;
			changedPoints.push(k);
		}
	}
	return {data:data,changedPoints:changedPoints}

}

function floodfill(data, vol, size, seed, v)
{
    var mystacksize = size[0] * size[1] * size[2];
    var mystack = new Uint32Array(mystacksize);
    var changedPoints = [];
    var cnt = 0;
    function push(x)
    {
        if (cnt < mystacksize)
        {
            mystack[cnt] = x;
            vol[x] = 1;
            changedPoints.push(x);
            cnt++;
        }


    }
    function pop()
    {
        cnt--;
        return mystack[cnt];
    }

    if (v == undefined)
        v = 0;

    var w = size[0];
    var h = size[1];
    var wh = size[0] * size[1];
    var whd = size[0] * size[1] * size[2];

    push(seed[0] + w * seed[1] + wh * seed[2]);

    function comp(a,b)
    {
        return (a>0 && b>0) | (a==b);
    }


    while (cnt > 0)
    {

        var idx = pop();
        if (idx >= 0 & idx < whd)
        {
            if (comp(v,data[idx + 1]) & vol[idx + 1] == 0)
                push(idx + 1);
            if (comp(v,data[idx - 1]) & vol[idx - 1] == 0)
                push(idx - 1);
            if (comp(v,data[idx + w]) & vol[idx + w] == 0)
                push(idx + w);
            if (comp(v,data[idx - w]) & vol[idx - w] == 0)
                push(idx - w);
            if (comp(v,data[idx + wh]) & vol[idx + wh] == 0)
                push(idx + wh);
            if (comp(v,data[idx - wh]) & vol[idx - wh] == 0)
                push(idx - wh);
        }

    }

    return changedPoints;


}



function atlasToRoi(data,progress,done)
{

	importScripts('KTools/KAtlasTool.js');
	
	
	var w2key = KAtlasTool.updateGetPixelFun(data.atlas,data.img,undefined,undefined,data.deffield)
	var sizes = data.img.sizes;
	if (typeof data.key == "object")
	{
		for (var z = 0; z < sizes[2];z++)
			for (var y = 0; y < sizes[1];y++)
			  for (var x = 0; x < sizes[0];x++)
			  {
					if (data.key[w2key(x,y,z)])
						data.img.data[x+sizes[0]*y + sizes[0]*sizes[1]*z] = 1;
			  }   

	}
	else
	{
		for (var z = 0; z < sizes[2];z++)
			for (var y = 0; y < sizes[1];y++)
			  for (var x = 0; x < sizes[0];x++)
			  {
					if (w2key(x,y,z) == data.key)
						data.img.data[x+sizes[0]*y + sizes[0]*sizes[1]*z] = 1;
			  }   
	}     

}



function createFiberVisitMap(data,progress)
{
	var lines = data.lines;
	var subset = data.subset;
	var buffer = data.data;
	var size = data.size;
	var edges = data.edges;
	var ep = data.endpoints;

	buffer.fill(0);

	var subsetlen;
	var wholebrain;
	if (subset)
	{
		subsetlen = subset.length;
		wholebrain = false;
	}
	else
	{
	    subsetlen = lines.length;
	    wholebrain = true;
	}
	var osamp = 3;
	var invedges = edges;
	var wh = size[0]*size[1];
	var w = size[0];
	var steps = math.floor(subsetlen/20);
	for (var l = 0; l < subsetlen; l++) {
		if (l%steps == 0)
			progress(l/subsetlen);


		var points = wholebrain?lines[l]:lines[subset[l]];
		var plen = points.length/3-1;
		var last0 = points[0];
		var last1 = points[1];
		var last2 = points[2];
		var start = (ep>0); // for ep rendering
		for (var index = 0; index < plen; index++) {
			if (start)
			{
				if (index > ep) // jump over central part
				{
					index = plen-ep;
					start = false;
				}
			}

			for (var k = 0 ; k < osamp ; k++)
			{
				var lam = k/osamp;
				var v0 = points[3*index  ]*(1-lam)+points[3*(index+1)  ]*lam;
				var v1 = points[3*index+1]*(1-lam)+points[3*(index+1)+1]*lam;
				var v2 = points[3*index+2]*(1-lam)+points[3*(index+1)+2]*lam;

				var weight = Math.sqrt( (last0-v0)*(last0-v0) + (last1-v1)*(last1-v1) + (last2-v2)*(last2-v2) );
				last0 = v0;
				last1 = v1;
				last2 = v2;
				
				var p0 = invedges[0][0]*v0 +invedges[0][1]*v1+invedges[0][2]*v2 +invedges[0][3];
				var p1 = invedges[1][0]*v0 +invedges[1][1]*v1+invedges[1][2]*v2 +invedges[1][3];
				var p2 = invedges[2][0]*v0 +invedges[2][1]*v1+invedges[2][2]*v2 +invedges[2][3];
				var i0 = math.floor(p0);
				var i1 = math.floor(p1);
				var i2 = math.floor(p2);
				var f0 = p0-i0;
				var f1 = p1-i1;
				var f2 = p2-i2;
				var idx = wh*i2 + w*i1 + i0;
				buffer[idx] += (1-f0)*(1-f1)*(1-f2)*weight;
				buffer[idx+1] += (f0)*(1-f1)*(1-f2)*weight;
				buffer[idx+w] += (1-f0)*(f1)*(1-f2)*weight;
				buffer[idx+wh] += (1-f0)*(1-f1)*(f2)*weight;
				buffer[idx+w+wh] += (1-f0)*(f1)*(f2)*weight;
				buffer[idx+1+wh] += (f0)*(1-f1)*(f2)*weight;
				buffer[idx+1+w] += (f0)*(f1)*(1-f2)*weight;
				buffer[idx+1+w+wh] += (f0)*(f1)*(f2)*weight;
			}
		}
	}
}





function computeIsoSurf(nii)
{
	var data = nii.data;
	var sizes = nii.sizes;
	var detsign = nii.detsign;
	var label = nii.label;
	var timepoint = nii.currentTimePoint;

	var w = sizes[0];
	var h = sizes[1];
	var d = sizes[2];
	var wh = sizes[0]*sizes[1];
	var whd = sizes[0]*sizes[1]*sizes[2];
	var offset = 0;
	if (timepoint != undefined)
		offset = timepoint.t*whd;


	var cnt = 0;
	var vertsIDX = [];
	function addVert(i)
	{
		if (vertsIDX[i] == undefined)
		{
			vertsIDX[i] = cnt;
			cnt++;
			return cnt-1;
		}		
		else
			return vertsIDX[i];
	}
	var trigs = [];
	var addTrigs;
	if (detsign == -1)
		addTrigs = function( i00,i10,i11,i01)
			{
				trigs.push(i00,i10,i11,i00,i11,i01);
			}
	else
		addTrigs = function( i00,i10,i11,i01)
			{
				trigs.push(i00,i01,i11,i00,i11,i10);
			}


	var compfun = function(x) { return x>0 }
	var negcompfun = function(x) { return x==0 }
	if (label)
	{
		if (label.threshold)
		{
			compfun = function(x) {
				return x>label.threshold;
			}
			negcompfun = function(x) {
				return x<=label.threshold;
			}
		}
		else
		{
			compfun = function(x) {
				return x==label;
			}
			negcompfun = function(x) {
				return x!=label;
			}
		}
	}


	var dataAt;
	if (sizes[3] == 3)
		dataAt = function(idx)
		{
			return Math.sqrt(data[idx]*data[idx]+data[idx+whd]*data[idx+whd]+data[idx+2*whd]*data[idx+2*whd]);
		}
	else
		dataAt = function(idx)
		{
			return data[idx+offset];
		}


	for (var z = 1; z < sizes[2]-1;z++)
	for (var y = 1; y < sizes[1]-1;y++)
	for (var x = 1; x < sizes[0]-1;x++)
	{
		var idx = z*wh + w*y + x;
		if (compfun(dataAt(idx)))
		{
			var i00,i10,i01,i11;
			if (negcompfun(dataAt(idx-1)))
			{
				i00 = addVert(idx);
				i10 = addVert(idx+w);
				i11 = addVert(idx+w+wh);
				i01 = addVert(idx+wh);
				addTrigs(i00,i01,i11,i10);
			} 

			if (negcompfun(dataAt(idx+1)))
			{
				i00 = addVert(idx+1);
				i10 = addVert(idx+1+wh);
				i11 = addVert(idx+1+w+wh);					
				i01 = addVert(idx+1+w);
				addTrigs(i00,i01,i11,i10);
			}

			if (negcompfun(dataAt(idx-w)))
			{
				i00 = addVert(idx);
				i10 = addVert(idx+1);
				i11 = addVert(idx+1+wh);
				i01 = addVert(idx+wh);
				addTrigs(i00,i10,i11,i01);
			} 
			if (negcompfun(dataAt(idx+w)))
			{
				i00 = addVert(idx+w);
				i10 = addVert(idx+w+wh);
				i11 = addVert(idx+w+1+wh);					
				i01 = addVert(idx+w+1);
				addTrigs(i00,i10,i11,i01);
			}

			if (negcompfun(dataAt(idx-wh)))
			{
				i00 = addVert(idx);
				i10 = addVert(idx+w);
				i11 = addVert(idx+w+1);
				i01 = addVert(idx+1);
				addTrigs(i00,i10,i11,i01);
			} 

			if (negcompfun(dataAt(idx+wh)))
			{
				i00 = addVert(idx+wh);
				i10 = addVert(idx+wh+1);
				i11 = addVert(idx+wh+w+1);					
				i01 = addVert(idx+wh+w);
				addTrigs(i00,i10,i11,i01);
			}
		}

	}



	var pts = Object.keys(vertsIDX);
	var verts = new Float32Array(pts.length*3);
	for (var k = 0; k < pts.length;k++)
	{
		var x = pts[k]%w -0.5;
		var y = math.floor(pts[k]/w)%h -0.5;
		var z = math.floor(pts[k]/wh) -0.5;
		var v = math.multiply(nii.edges,[x,y,z,1])._data;
		var i = vertsIDX[pts[k]];
		verts[3*i] = v[0];
		verts[3*i+1] = v[1];
		verts[3*i+2] = v[2];
	}

    verts = smooth(verts,trigs);
 	verts = smooth(verts,trigs);
	verts = smooth(verts,trigs);
	



	var normal = new Float32Array(pts.length*3);
	var area = 0;
	for (var k=0;k<trigs.length/3;k++)
		{
			var t1 = trigs[3*k];
			var t2 = trigs[3*k+1];
			var t3 = trigs[3*k+2];

			var a = [verts[3*t1+0],verts[3*t1+1],verts[3*t1+2]]
			var b = [verts[3*t2+0],verts[3*t2+1],verts[3*t2+2]]
			var c = [verts[3*t3+0],verts[3*t3+1],verts[3*t3+2]]
			var n =     [(b[1]-a[1])*(c[2]-a[2]) - (b[2]-a[2])*(c[1]-a[1]), 
						 (b[2]-a[2])*(c[0]-a[0]) - (b[0]-a[0])*(c[2]-a[2]),
						 (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])];

			for (var j=0;j<3;j++)
			{	
				normal[3*trigs[3*k+j]+0] -= n[0];
				normal[3*trigs[3*k+j]+1] -= n[1];
				normal[3*trigs[3*k+j]+2] -= n[2];
			}
			area += Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
		}


	var c = {}
	c.points = verts;
	c.indices = trigs;
	c.normals = normal;
	c.area = area*0.5;

	return c;







	function smooth(verts,trigs)
	{
		var verts_sm = new Float32Array(verts.length);
		var ncnt = new Int32Array(verts.length/3);
		for (var k=0;k<trigs.length/3;k++)
			{
				var v = [0,0,0];
				for (var j = 0; j < 3;j++)
				{				
					for (var i = 0; i < 3; i++)
					   v[i] += verts[3*trigs[3*k+j]+i]*0.3333;
				}
				for (var j = 0; j < 3;j++)
				{				
					for (var i = 0; i < 3; i++)
					   verts_sm[3*trigs[3*k+j]+i] += v[i];
					ncnt[trigs[3*k+j]]++;
				}

			}
		for (var k = 0; k < verts.length/3;k++)
		{
			verts_sm[3*k] /= ncnt[k];
			verts_sm[3*k+1] /= ncnt[k];
			verts_sm[3*k+2] /= ncnt[k];
		}
		return verts_sm;
	}

}




/* bwconncomp - perform a connected component analsis
input: data - mask array or sontinous array to decomposed
       size - size of the array [w,h,d]
       comp - function defining whether data[i] is on or off, e.g. function (x) { return x>0;} for masks
       clustthres - only clusters above this threshold are considered (number of voxels)
       target - optional, array of same size as data, if given, all values that do not belong to the labeling are set to zero in target.
output: obj = {labels,clusterSize , changedPoints}
       labels - label array of same size as data
       clusterSize - sizes array of clusters
       changedPoints - if target given the voxels that switched to zero */

function bwconncomp(data, size, comp, clustthres, target)
{

    var changedPoints = [];
    var labels = new Uint32Array(data);
    var w = size[0];
    var h = size[1];
    var d = size[2];
    var wh = size[0] * size[1];
    var whd = size[0] * size[1] * size[2];
    labels.fill(0);

    var map = {}

    var cur_label = 2147483648;
    for (var z = 0; z < size[2]; z++)
        for (var y = 0; y < size[1]; y++)
            for (var x = 0; x < size[0]; x++)
            {
                var idx = x+w*y+wh*z;
                if (comp(data[idx]))
                {
                    var l = 0
                    if (labels[idx - 1] == 0 && labels[idx - w] == 0 && labels[idx - wh] == 0)
                    {
                        labels[idx] = cur_label--;
                        continue;
                    }


                    mmi(1,w,wh)
                    mmi(w,1,wh)
                    mmi(wh,1,w)
                    
                    function mmi(a,b,c)
                    {
                        if (labels[idx - a] >= labels[idx - b]  && labels[idx - a] >= labels[idx - c])
                        {
                            l = labels[idx - a];
                            labels[idx] = l;
                            if (labels[idx - b] > 0 && l != labels[idx - b])
                            {
                                map[labels[idx - b]] = l;
                                labels[idx - b] = l;
                            }
                            if (labels[idx - c] > 0 && l != labels[idx - c])
                            {
                                map[labels[idx - c]] = l;                            
                                labels[idx - c] = l; 
                            }
                            return true;
                        }
                    }

        

                }
            }

            var keys = Object.keys(map);
            function look(a)
            {
                if (map[a] == undefined)
                    return a;
                else 
                    return look(map[a]);
            }
            for (var k = 0; k < keys.length;k++)
                map[keys[k]] = look(keys[k]);

            var clustsize = {};
            var cog = {};
            for (var z = 0; z < whd; z++)
                if (comp(data[z]))
                {
                    var k = map[labels[z]];
                    if (k == undefined)
                        k = labels[z];
                    labels[z] = k;
                    if (clustsize[k] == undefined)
                    {
                        clustsize[k] = 1;
                        cog[k] = [z%w,Math.floor(z/w)%h,Math.floor(z/wh)%d]
                    }
                    else
                    {
                        clustsize[k]++;
                        cog[k][0] += z%w
                        cog[k][1] += Math.floor(z/w)%h
                        cog[k][2] += Math.floor(z/wh)%d;
                    }

                }
                       
            var clusts = Object.keys(clustsize);
            var indic = {};
            var clusterSize = {};
            var centerOfGrav ={}
            var cnum = 1;
            for (var k = 0 ; k < clusts.length;k++)
            {
                if (clustsize[clusts[k]] > clustthres)
                {

                    clusterSize[cnum] = clustsize[clusts[k]];
                    var v = [ cog[clusts[k]][0]/clustsize[clusts[k]],
                              cog[clusts[k]][1]/clustsize[clusts[k]],
                              cog[clusts[k]][2]/clustsize[clusts[k]] ];
                    centerOfGrav[cnum] = v;
                    indic[clusts[k]] = cnum;
                    cnum++;
                }
            }


            for (var z = 0; z < whd; z++)
                if (comp(data[z]))
                {

                    if (!indic[labels[z]])
                    {
                        if (target != undefined)
                            target[z] = 0;
                        labels[z] = 0;
                        changedPoints.push(z);
                    }
                    else
                        labels[z] = indic[labels[z]];
                }
                else
                    if (target != undefined)
                        target[z] = 0;

         
           return {centerOfGrav:centerOfGrav,changedPoints:changedPoints,labels:labels,clusterSize:clusterSize};

  
}
