importScripts("DBSsimulation.js");

    function trilinInterp(thenii, px, py, pz, A, offs)
    {
        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = Math.floor(xs + 0.0000001);
        var yi = Math.floor(ys + 0.0000001);
        var zi = Math.floor(zs + 0.0000001);
        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi;
        var currentVal = undefined;
        if (zi < thenii.sizes[2] && zi >= 0 && yi < thenii.sizes[1] && yi >= 0 && xi < thenii.sizes[0] && xi >= 0)
        {

            var currentIndex000 = (thenii.widhei * zi + yi * thenii.wid + xi) % thenii.widheidep + offs;
            var currentIndex100 = (thenii.widhei * zi + (yi + 1) * thenii.wid + xi) % thenii.widheidep + offs;
            var currentIndex010 = (thenii.widhei * (zi + 1) + yi * thenii.wid + xi) % thenii.widheidep + offs;
            var currentIndex001 = (thenii.widhei * zi + yi * thenii.wid + (xi + 1)) % thenii.widheidep + offs;
            var currentIndex110 = (thenii.widhei * (zi + 1) + (yi + 1) * thenii.wid + xi) % thenii.widheidep + offs;
            var currentIndex011 = (thenii.widhei * (zi + 1) + yi * thenii.wid + (xi + 1)) % thenii.widheidep + offs;
            var currentIndex101 = (thenii.widhei * zi + (yi + 1) * thenii.wid + (xi + 1)) % thenii.widheidep + offs;
            var currentIndex111 = (thenii.widhei * (zi + 1) + (yi + 1) * thenii.wid + (xi + 1)) % thenii.widheidep + offs;
            var currentVal = thenii.data[currentIndex000] * (1 - xf) * (1 - yf) * (1 - zf) +
            thenii.data[currentIndex100] * (1 - xf) * (yf) * (1 - zf) +
            thenii.data[currentIndex010] * (1 - xf) * (1 - yf) * (zf) +
            thenii.data[currentIndex001] * (xf) * (1 - yf) * (1 - zf) +
            thenii.data[currentIndex110] * (1 - xf) * (yf) * (zf) +
            thenii.data[currentIndex011] * (xf) * (1 - yf) * (zf) +
            thenii.data[currentIndex101] * (xf) * (yf) * (1 - zf) +
            thenii.data[currentIndex111] * (xf) * (yf) * (zf);
        }

        return currentVal;

    }


    function trilinInterp3_signcorrected(thenii, px, py, pz, A, totsz,offset)
    {
        if (offset == undefined)
            offset = 0;

        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = Math.floor(xs + 0.0000001);
        var yi = Math.floor(ys + 0.0000001);
        var zi = Math.floor(zs + 0.0000001);
        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi;
        var currentVal;
        if (zi < thenii.sizes[2] && zi >= 0 && yi < thenii.sizes[1] && yi >= 0 && xi < thenii.sizes[0] && xi >= 0)
        {

            currentVal = [0, 0, 0];
            var currentIndex000 = offset+ (thenii.widhei * zi + yi * thenii.wid + xi) % thenii.widheidep;
            var currentIndex100 = offset+ (thenii.widhei * zi + (yi + 1) * thenii.wid + xi) % thenii.widheidep;
            var currentIndex010 = offset+ (thenii.widhei * (zi + 1) + yi * thenii.wid + xi) % thenii.widheidep;
            var currentIndex001 = offset+ (thenii.widhei * zi + yi * thenii.wid + (xi + 1)) % thenii.widheidep;
            var currentIndex110 = offset+ (thenii.widhei * (zi + 1) + (yi + 1) * thenii.wid + xi) % thenii.widheidep;
            var currentIndex011 = offset+ (thenii.widhei * (zi + 1) + yi * thenii.wid + (xi + 1)) % thenii.widheidep;
            var currentIndex101 = offset+ (thenii.widhei * zi + (yi + 1) * thenii.wid + (xi + 1)) % thenii.widheidep;
            var currentIndex111 = offset+ (thenii.widhei * (zi + 1) + (yi + 1) * thenii.wid + (xi + 1)) % thenii.widheidep;

            var magX = Math.abs(thenii.data[currentIndex000]) +
            Math.abs(thenii.data[currentIndex001]) +
            Math.abs(thenii.data[currentIndex010]) +
            Math.abs(thenii.data[currentIndex100]) +
            Math.abs(thenii.data[currentIndex110]) +
            Math.abs(thenii.data[currentIndex011]) +
            Math.abs(thenii.data[currentIndex101]) +
            Math.abs(thenii.data[currentIndex111]);
            var magY = Math.abs(thenii.data[currentIndex000 + totsz]) +
            Math.abs(thenii.data[currentIndex001 + totsz]) +
            Math.abs(thenii.data[currentIndex010 + totsz]) +
            Math.abs(thenii.data[currentIndex100 + totsz]) +
            Math.abs(thenii.data[currentIndex110 + totsz]) +
            Math.abs(thenii.data[currentIndex011 + totsz]) +
            Math.abs(thenii.data[currentIndex101 + totsz]) +
            Math.abs(thenii.data[currentIndex111 + totsz]);
            var magZ = Math.abs(thenii.data[currentIndex000 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex001 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex010 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex100 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex110 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex011 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex101 + 2 * totsz]) +
            Math.abs(thenii.data[currentIndex111 + 2 * totsz]);

            var off = 0;
            if (magZ > magY && magZ > magX)
                off = 2 * totsz;
            else if (magY > magZ && magY > magX)
                off = totsz;


            var sg000 = Math.sign(thenii.data[currentIndex000 + off]);
            var sg001 = Math.sign(thenii.data[currentIndex001 + off]);
            var sg010 = Math.sign(thenii.data[currentIndex010 + off]);
            var sg100 = Math.sign(thenii.data[currentIndex100 + off]);
            var sg110 = Math.sign(thenii.data[currentIndex110 + off]);
            var sg011 = Math.sign(thenii.data[currentIndex011 + off]);
            var sg101 = Math.sign(thenii.data[currentIndex101 + off]);
            var sg111 = Math.sign(thenii.data[currentIndex111 + off]);

            currentVal[0] = thenii.data[currentIndex000] * (1 - xf) * (1 - yf) * (1 - zf) * sg000 +
            thenii.data[currentIndex100] * (1 - xf) * (yf) * (1 - zf) * sg100 +
            thenii.data[currentIndex010] * (1 - xf) * (1 - yf) * (zf) * sg010 +
            thenii.data[currentIndex001] * (xf) * (1 - yf) * (1 - zf) * sg001 +
            thenii.data[currentIndex110] * (1 - xf) * (yf) * (zf) * sg110 +
            thenii.data[currentIndex011] * (xf) * (1 - yf) * (zf) * sg011 +
            thenii.data[currentIndex101] * (xf) * (yf) * (1 - zf) * sg101 +
            thenii.data[currentIndex111] * (xf) * (yf) * (zf) * sg111;

            currentVal[1] = thenii.data[currentIndex000 + totsz] * (1 - xf) * (1 - yf) * (1 - zf) * sg000 +
            thenii.data[currentIndex100 + totsz] * (1 - xf) * (yf) * (1 - zf) * sg100 +
            thenii.data[currentIndex010 + totsz] * (1 - xf) * (1 - yf) * (zf) * sg010 +
            thenii.data[currentIndex001 + totsz] * (xf) * (1 - yf) * (1 - zf) * sg001 +
            thenii.data[currentIndex110 + totsz] * (1 - xf) * (yf) * (zf) * sg110 +
            thenii.data[currentIndex011 + totsz] * (xf) * (1 - yf) * (zf) * sg011 +
            thenii.data[currentIndex101 + totsz] * (xf) * (yf) * (1 - zf) * sg101 +
            thenii.data[currentIndex111 + totsz] * (xf) * (yf) * (zf) * sg111;

            currentVal[2] = thenii.data[currentIndex000 + totsz * 2] * (1 - xf) * (1 - yf) * (1 - zf) * sg000 +
            thenii.data[currentIndex100 + totsz * 2] * (1 - xf) * (yf) * (1 - zf) * sg100 +
            thenii.data[currentIndex010 + totsz * 2] * (1 - xf) * (1 - yf) * (zf) * sg010 +
            thenii.data[currentIndex001 + totsz * 2] * (xf) * (1 - yf) * (1 - zf) * sg001 +
            thenii.data[currentIndex110 + totsz * 2] * (1 - xf) * (yf) * (zf) * sg110 +
            thenii.data[currentIndex011 + totsz * 2] * (xf) * (1 - yf) * (zf) * sg011 +
            thenii.data[currentIndex101 + totsz * 2] * (xf) * (yf) * (1 - zf) * sg101 +
            thenii.data[currentIndex111 + totsz * 2] * (xf) * (yf) * (zf) * sg111;

        }

        return currentVal;

    }



self.addEventListener('message', function(e) {
	
	var cid = -1;
	var cnt = 0;
	var execObj = e.data;
	if (e.data.message == 'startSim')
	{
	  self.hold = false;

	  cid = setInterval(function()
	  {
			if (self.hold)
				return;

			var elecGeometry = e.data.elecGeometry;
			var simParams = e.data.simParams;
			var potential = e.data.potential;
			var current = e.data.current;
			var sigma =  e.data.sigma;
			var chunks = e.data.chunks;

	  		var meanResistance = solvePoissonMC(elecGeometry,simParams,potential,current,sigma);
	  		cnt++;

			self.postMessage({msg:'progress',cnt:cnt, details:"simulating " + Math.floor(100*cnt/chunks)+ "%" , 
								meanResistance:meanResistance,
								potential_data: potential.data,
								current_data: current.data},[]);

	  		if (cnt > chunks)
	  		{
	  			clearInterval(cid);
	  			cid = -1;
				self.postMessage({msg:'done'},[]);
	  			self.close();
	  		}
	  },0);


	}
	else if (e.data.message == 'hold')
	{
		self.postMessage({msg:'paused'},[]);
		self.hold = true;
	}
	else if (e.data.message == 'continue')
	{
		self.hold = false;
	}
	else if (e.data.message == 'kill')
	{
		clearInterval(cid);
		self.postMessage({msg:'done'},[]);
		self.close();
	}


}, false);

