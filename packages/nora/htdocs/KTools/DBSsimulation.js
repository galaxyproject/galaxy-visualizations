function fastCos(x) {
    var x2 = x * x;
    var x4 = x2 * x2;
    var x6 = x4 * x2;
    var x8 = x6 * x2;
    var x10 = x8 * x2;
    return 1 - (1814400 * x2 - 151200 * x4 + 5040 * x6 - 90 * x8 + x10) / 3628800;
}

function solvePoissonMC(elecGeometry,params,nii,current,conductivity)
{

	var M = 256;
	var cosLUT = new Array(M)
	var sinLUT = new Array(M)
	for (var l = 0; l < M;l++)
	{
		cosLUT[l] = Math.cos(Math.PI*2*l/M);
		sinLUT[l] = Math.sin(Math.PI*2*l/M);
	}

	function cos(x)
	{
		return cosLUT[Math.floor(x*M)];
	}
	function sin(x)
	{
		return sinLUT[Math.floor(x*M)];
	}

	var alpha = params.alpha;
	var N = 1; //Math.ceil(4*alpha);
	var weight = 1/N;

	var num_particles = params.num_particles_;
	var num_steps = params.num_steps

	var buffer = new Float32Array(nii.sizes[0]*nii.sizes[1]*nii.sizes[2]);
	nii.data = buffer;

	var buffer_current = new Float32Array(nii.sizes[0]*nii.sizes[1]*nii.sizes[2]*3);
	current.data = buffer_current;

	var w = nii.sizes[0];
	var h = nii.sizes[1];
	var d = nii.sizes[2];

	var w2 = w/2;
	var h2 = h/2;
	var d2 = d/2;
	var domsq = w2*w2;
	var wh = nii.widhei;
	var whd = w*h*d;
	var e = nii.invedges;
	var ie = nii.edges;

	if (conductivity)
	{
		var e2c = conductivity.invedges;
		var cond = conductivity.data;
		var w_cond = conductivity.sizes[0];
		var wh_cond = conductivity.widhei;
		var whd_cond = conductivity.sizes[0]*conductivity.sizes[1]*conductivity.sizes[2];
	}



	var tip = elecGeometry.tip;
	var end = elecGeometry.end;
	var min = elecGeometry.c_min;
	var max = elecGeometry.c_max;
	var radius = elecGeometry.radius;
	var r2 = elecGeometry.radius*elecGeometry.radius;

	var n = [end[0]-tip[0],end[1]-tip[1],end[2]-tip[2]];
	var norm = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
	n[0] /= norm; n[1] /= norm; n[2] /= norm;

	var nx = [ n[0],-n[2],n[1] ];
	var ny = [ n[1]*nx[2] - n[2]*nx[1],
			   n[2]*nx[0] - n[0]*nx[2],
			   n[0]*nx[1] - n[1]*nx[0]];

	function getDisplacement(fac)
	{
		/*
		var r = Math.floor(Math.random()*num_dirs);
		var sg = 1;
		if (Math.random()>0.5)
			sg = -1;
		return [iso_directions[r][0]*sg,iso_directions[r][1]*sg,iso_directions[r][2]*sg];
		*/
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

		var x = h*cos(u1);
		var y = h*sin(u1);
//		var x = h*Math.cos(u1*2*Math.PI);
//		var y = h*Math.sin(u1*2*Math.PI);
		
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

//		var z = h*Math.cos(u1*2*Math.PI);
		var z = h*cos(u1);

		return [fac*x,fac*y,fac*z];

		//return [gaussian(),gaussian(),gaussian()];
		
	}


	function getDisplacementAniso(C,alpha)
	{
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

		var x = h*cos(u1)*alpha;
		var y = h*sin(u1)*alpha;
				
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

		var z = h*cos(u1)*alpha;

		return [ C[0]*x +  C[3]*y +  C[6]*z , 
				 C[1]*x +  C[4]*y +  C[7]*z ,
				 C[2]*x +  C[5]*y +  C[8]*z ];

	}



	function getStartPoint()
	{
		if (elecGeometry.multipolar.length > 0)
		{
			var m = elecGeometry.multipolar
			var p = Math.random();
			var a = 0
			var k;
			for (k = 0; k < m.length;k++)
			{
				if (p <= (a+m[k].current))
					break;
				a+=m[k].current;				
			}

			var c = Math.random();
			var x = radius*Math.cos(2*Math.PI*c);
			var y = radius*Math.sin(2*Math.PI*c);

			var r = m[k].min + (m[k].max-m[k].min)*Math.random();

			return {p:[ tip[0] + r*n[0] + x*nx[0] + y*ny[0],
					 tip[1] + r*n[1] + x*nx[1] + y*ny[1],	
					 tip[2] + r*n[2] + x*nx[2] + y*ny[2] ] ,s:m[k].sign};



		}
		else
		{		
			var c = Math.random();
			var x = radius*Math.cos(2*Math.PI*c);
			var y = radius*Math.sin(2*Math.PI*c);

			var r = min + (max-min)*Math.random();


			return {p:[ tip[0] + r*n[0] + x*nx[0] + y*ny[0],
					 tip[1] + r*n[1] + x*nx[1] + y*ny[1],	
					 tip[2] + r*n[2] + x*nx[2] + y*ny[2] ],s:1};
		}		
	}

	function getStartPointSphere()
	{

		var r = (min+max)*0.5;

		return [ tip[0] + r*n[0],
				 tip[1] + r*n[1],
				 tip[2] + r*n[2] ];
		
	}


	function isNeumann(p)
	{
		var dif = [p[0]-tip[0],p[1]-tip[1],p[2]-tip[2]];
		var proj = dif[0]*n[0]+dif[1]*n[1]+dif[2]*n[2];
		if (proj > 0)
		{
			var dif2 = dif[0]*dif[0] + dif[1]*dif[1] + dif[2]*dif[2];
			if (dif2 -proj*proj < r2)
				return true;
		}
		return false;
	}

	function probround(x)
	{
		var xi = Math.floor(x);
		if (Math.random() < (x-xi))
			return xi+1;
		else
			return xi;
	}

	function accumulate_interp(p2,p1,sign)
	{
		var n = [p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]];

	    var i0 = Math.round(p1[0])
		var i1 = Math.round(p1[1])
		var i2 = Math.round(p1[2])
		var idx = wh*i2 + w*i1 + i0;
		buffer[idx]+=sign

		var i0 = Math.round((p1[0]+p2[0])*0.5);
		var i1 = Math.round((p1[1]+p2[1])*0.5);
		var i2 = Math.round((p1[2]+p2[2])*0.5);
		var idx = wh*i2 + w*i1 + i0;
		buffer_current[idx] += n[0]*sign
		buffer_current[idx+whd] += n[1]*sign
		buffer_current[idx+2*whd] += n[2]*sign

	}

	function mult(M,e)
	{
		return [ M[0][0]*e[0]+M[0][1]*e[1]+M[0][2]*e[2],
				 M[1][0]*e[0]+M[1][1]*e[1]+M[1][2]*e[2],
			     M[2][0]*e[0]+M[2][1]*e[1]+M[2][2]*e[2] ];
	}

	function mult4(M,e)
	{
		return [ M[0][0]*e[0]+M[0][1]*e[1]+M[0][2]*e[2]+M[0][3]*e[3],
				 M[1][0]*e[0]+M[1][1]*e[1]+M[1][2]*e[2]+M[1][3]*e[3],
			     M[2][0]*e[0]+M[2][1]*e[1]+M[2][2]*e[2]+M[2][3]*e[3] ];
	}


	function det3(a)
	{
		return a[0] * (a[4] * a[8] - a[5] * a[7]) + a[1] * (a[5] * a[6] - a[3] * a[8]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
	}




	var p;
	var proposal;
	var current_sigma;
	var default_sigma = 1;
	var drawDisplacement = function(current_sigma,alpha) { return getDisplacement(current_sigma*alpha); }
	var doProp = function() { return 0};



	 if (params.analytical)
	 {




		if (elecGeometry.multipolar.length > 0)
		{
			var m = elecGeometry.multipolar
			var slist = [];
			for (var k = 0; k < m.length;k++)
			{
		 	    var r = m[k].min + (m[k].max-m[k].min)*0.5;
				slist.push ([ tip[0] + r*n[0] ,
						 tip[1] + r*n[1],	
						 tip[2] + r*n[2],m[k].current*m[k].sign ]  ) ;
			}


		}
		else
		{		


			 var r = min + (max-min)*0.5;
			 var slist =   [[ tip[0] + r*n[0] ,
						 tip[1] + r*n[1],	
						 tip[2] + r*n[2],1 ]]
		}


		var fac = 1/(Math.PI*4);

		for (var x = 0; x < w ; x++)
		for (var y = 0; y < h ; y++)
		for (var z = 0; z < d ; z++)
		{
			var p = mult4(ie._data,[x,y,z,1])
			var idx = wh*z + w*y + x;
			buffer[idx]=0;
			buffer_current[idx]=0;
			buffer_current[idx+whd]=0;
			buffer_current[idx+whd*2]=0;

			for (var k = 0; k < slist.length;k++)
			{
				var s = slist[k];
				var r = [p[0]-s[0],p[1]-s[1],p[2]-s[2]];		
				var absr =Math.sqrt(r[0]*r[0]+r[1]*r[1]+r[2]*r[2]);

				buffer[idx]+=s[3]*fac/(absr+0.00001);
				var env = s[3]*fac/(absr*absr*absr+0.00001);
				buffer_current[idx]+=env*r[0];
				buffer_current[idx+whd]+=env*r[1];
				buffer_current[idx+whd*2]+=env*r[2];
			}

		}
		return 1;
	 }


	if (conductivity)
	{
		if (conductivity.sizes[3] == 1)
		{
			doProp = function()
			{

				var new_sigma = Math.sqrt(trilinInterp(conductivity,proposal[0],proposal[1],proposal[2],e2c,0));

				if (isNaN(new_sigma) | new_sigma==0)
					return -1;  // break;

				var dx2 = (dx[0]*dx[0]+dx[1]*dx[1]+dx[2]*dx[2])/(current_sigma*current_sigma);
				if (current_sigma != new_sigma)
				{
					var sig_ratio = current_sigma/new_sigma;
					var sig_ratio2 = sig_ratio*sig_ratio;
					var R = Math.exp(0.5*dx2 * (1 - sig_ratio2   ) ) * sig_ratio*sig_ratio2;

					if (R < 1)
					{
						if (R < Math.random())
							return 1; // continue;

					}

				}
				current_sigma = new_sigma;

				return 0;
			}
		}
		else
		{

			default_sigma = [1,0,0,0,1,0,0,0,1,1,1,1,1];

			drawDisplacement = function(current_sigma,alpha)
			{
				return getDisplacementAniso(current_sigma,alpha);
			}

			doProp = function()
			{
				var slope = conductivity.datascaling.slope;
				var e1 = trilinInterp3_signcorrected(conductivity,proposal[0],proposal[1],proposal[2],e2c,whd_cond,0);
				var e2 = trilinInterp3_signcorrected(conductivity,proposal[0],proposal[1],proposal[2],e2c,whd_cond,whd_cond*3);
				var e3 = trilinInterp3_signcorrected(conductivity,proposal[0],proposal[1],proposal[2],e2c,whd_cond,whd_cond*6);
				e1 = mult(conductivity.edges._data,e1);
				e2 = mult(conductivity.edges._data,e2);
				e3 = mult(conductivity.edges._data,e3);

				//var new_sigma =  [e1[0]*slope,e1[1]*slope,e1[2]*slope,e2[0]*slope,e2[1]*slope,e2[2]*slope,e3[0]*slope,e3[1]*slope,e3[2]*slope];
				var new_sigma =  [e1[0]*slope,e1[1]*slope,e1[2]*slope,e2[0]*slope,e2[1]*slope,e2[2]*slope,e3[0]*slope,e3[1]*slope,e3[2]*slope];
				
				new_sigma[9] = 1/(new_sigma[0]*new_sigma[0]+new_sigma[1]*new_sigma[1]+new_sigma[2]*new_sigma[2]);
				new_sigma[10] = 1/(new_sigma[3]*new_sigma[3]+new_sigma[4]*new_sigma[4]+new_sigma[5]*new_sigma[5]);
				new_sigma[11] = 1/(new_sigma[6]*new_sigma[6]+new_sigma[7]*new_sigma[7]+new_sigma[8]*new_sigma[8]);
				new_sigma[12] = Math.abs(det3(new_sigma));
				
				var q = [ (new_sigma[0]*dx[0] + new_sigma[1]*dx[1] + new_sigma[2]*dx[2])*new_sigma[9],
						  (new_sigma[3]*dx[0] + new_sigma[4]*dx[1] + new_sigma[5]*dx[2])*new_sigma[10],
						  (new_sigma[6]*dx[0] + new_sigma[7]*dx[1] + new_sigma[8]*dx[2])*new_sigma[11] ];
			    var q2 = q[0]*q[0] + q[1]*q[1] + q[2]*q[2];

				var r = [ (current_sigma[0]*dx[0] + current_sigma[1]*dx[1] + current_sigma[2]*dx[2])*current_sigma[9],
						  (current_sigma[3]*dx[0] + current_sigma[4]*dx[1] + current_sigma[5]*dx[2])*current_sigma[10],
						  (current_sigma[6]*dx[0] + current_sigma[7]*dx[1] + current_sigma[8]*dx[2])*current_sigma[11] ];
			    var r2 = r[0]*r[0] + r[1]*r[1] + r[2]*r[2];

				var R = Math.exp(0.5*(-q2+r2)/(alpha*alpha)) * current_sigma[12]/new_sigma[12];

				if (R < 1)
				{
					if (R < Math.random())
						return 1; // continue;

				}

				current_sigma = new_sigma;

				return 0;
		

			}



			
		}

	}










	var t = 0;
	for (var k = 0; k < num_particles;k++)
	{
		//var p = getStartPointSphere();
		var sp = getStartPoint();
		var p = sp.p;
		var sign = sp.s;
		
		var pv_old = [ e[0][0]*p[0] + e[0][1]*p[1] + e[0][2]*p[2] + e[0][3],   // in voxel coordinates of simulation grid
			              e[1][0]*p[0] + e[1][1]*p[1] + e[1][2]*p[2] + e[1][3],
			              e[2][0]*p[0] + e[2][1]*p[1] + e[2][2]*p[2] + e[2][3] ];

		var steps = 0;
		current_sigma = default_sigma;
		while(steps < num_steps)
		{

			steps++;

			var dx = drawDisplacement(current_sigma,alpha);
			proposal = [p[0] + dx[0],p[1] + dx[1],p[2] + dx[2]]
			var proposal_between = [p[0] + 0.5*dx[0],p[1] + 0.5*dx[1],p[2] + 0.5*dx[2]]
			if (isNeumann(proposal) | isNeumann(proposal_between))
			{
				//if (pv_old != undefined)			
				//	accumulate_interp(pv_old,proposal,Math.sqrt(norm));
				continue;
			}

			var action = doProp();
			if (action == -1)
				break;
			else if (action == 1)
				continue;
							

			p = proposal;

			var p_v =   [ e[0][0]*p[0] + e[0][1]*p[1] + e[0][2]*p[2] + e[0][3],   // in voxel coordinates of simulation grid
			              e[1][0]*p[0] + e[1][1]*p[1] + e[1][2]*p[2] + e[1][3],
			              e[2][0]*p[0] + e[2][1]*p[1] + e[2][2]*p[2] + e[2][3] ];

			if (pv_old != undefined)			
				accumulate_interp(pv_old,p_v,sign);

			if  ( (p_v[0]-w2)*(p_v[0]-w2) + (p_v[1]-h2)*(p_v[1]-h2) + (p_v[2]-d2)*(p_v[2]-d2) > domsq)
				break;

	
			t++;

			pv_old = p_v;

		}
	}
	return t/num_particles/domsq;

}



function KSimulationPanel(electrode)
{

    var panel = KPanel($(document.body),electrode.uuid + electrode.name,"VAT simulation");
    panel.closeOnCloseAll = true
	var $container = panel.$container;
    $container.addClass("DBSpanel")

	var cid = -1;
    var $fileRow = $("<div ></div>").appendTo(panel.$container);
    var $fileRow2 = $("<div class='panel'></div>").appendTo(panel.$container);


    var filePotential;
    var fileCurrent;

	var swarm;

	var $name = $("<div class='DBS_name'></div>").appendTo($fileRow);

	$fileRow.append($("<hr>")).append($("<i class='flexspacer'></i>"));

    var $simulate = $("<a style='width:80px;' class='KViewPort_tool'> Simulate </a>").appendTooltip("dosim").click(
		function(e)
		{

			if (swarm == undefined)
			{
				doSimulation()
				$simulate.text("Stop");
				panel.progressSpinner("simulating");
				$container.find(".panel").addClass("inactive");
				KViewer.markerTool.$container.addClass("inactive")
			}
			else
			{

				if (swarm.ishold && filePotential.content.sizes[0] != simParams.numvox)
					{
						alertify.error("Parameters changed, clear simulation first!");
						return;
					}

				if (!swarm.toggle())
				{
					
					$simulate.text("Stop");
					panel.progressSpinner("simulating");
					$container.find(".panel").addClass("inactive");
					KViewer.markerTool.$container.addClass("inactive")

				}
				else
				{
					$simulate.text("Continue");
					$clearsim.removeClass("inactive");
					panel.progressSpinner("simulating");
					$container.find(".panel").removeClass("inactive");
					KViewer.markerTool.$container.removeClass("inactive")


				}
			}
		}
    )
    $fileRow.append($simulate).append($("<i class='flexspacer'></i>"));

    var $clearsim = $("<a style='width:80px;' class='KViewPort_tool'> Clear </a>").appendTooltip("clearsim").click(
		function(e)
		{
				if (swarm != undefined)
				{
					swarm.kill();
				    $clearsim.addClass("inactive");
				   // clear();
				}
				$simulate.text("Simulate");
				panel.progressSpinner();
		}
    )
    $clearsim.addClass("inactive");
    $fileRow.append($clearsim).append($("<i class='flexspacer'></i>"));


	var simParams = {};

	function inputParam(name,defaultval,unit,$div)
	{
		if (unit == undefined)
			unit = "";
		else
			unit = "("+unit+")";

		if ($div == undefined)
			$div = $fileRow2;

		var $param = $("<span class='DBS_paramname'> "+name+" </span> <input class='DBS_paraminput'  min=0 step=1 type='number' value='"+defaultval+"'> "+unit+"<br>")
		$div.append($param).append($("<i class='flexspacer'></i>"));
		simParams[name] = defaultval;
		$($param[2]).on("change",function(){
			simParams[name] = parseFloat($(this).val());			
		});
	}


	$fileRow2.append($("<hr>"))
	//inputParam("Voltage",5);
	//inputParam("Impedance",1000);

	var $analytical = $("<div><span class='DBS_paramname'>Analytical</span> <input class='DBS_paraminput' type='checkbox' value='0'> </div>").appendTo($fileRow2);
	$analytical.find("input").on("change",function(e)
	{
		simParams.analytical = this.checked;
	});

	inputParam("Current",5,"mA");
	inputParam("Conductivity",0.2,"S/m");

	var $thresholdCurrent = $("<div><span class='DBS_paramname'>Current threshold</span> <input class='DBS_paraminput' type='number' value='0.1' step='0.05' min='0' max='1'> </div>").appendTo($fileRow2);
	electrode.threshold = 0.1; 
	$thresholdCurrent.find("input").on("change",function(e)
	{
		electrode.threshold = parseFloat($(this).val());
		for (var x in electrode.onupdate)
			electrode.onupdate[x]();

	});



	var $wrap = $("<div class='annotation_tool_elemDIV' ></div>").appendTo($fileRow2);
	var $dragarea = $("<div dragover='return false'; class='annotation_tool_droparea' style='height:40px !important;'><span>drop nifti to define conductivity</span></div>").appendTo($wrap);
	panel.$container.on("dragover", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
	panel.$container.on("dragleave", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
	panel.$container.on("drop",ondrop);
	panel.$container.width(300);


	var $detailparam_head = $("<div class='DBS_simparams_head'> ... more simulation parameters</div>").appendTo($fileRow2);
	var $detailparam = $("<div class='DBS_simparams'></div>").appendTo($detailparam_head);
	inputParam("alpha",1,null,$detailparam);
	inputParam("boxlen",25,"mm",$detailparam);
	inputParam("numvox",50,null,$detailparam);
	inputParam("num_particles",500000,null,$detailparam);
	inputParam("num_steps",5000,null,$detailparam);
	inputParam("num_workers",2,null,$detailparam);
	inputParam("num_chunks",10,null,$detailparam);



	$fileRow2.append($("<hr>"))

	var $fileDivs = $("<div class='DBS_filedivs'></div>").appendTo($fileRow2)
	var $currentFile = $("<div></div>").appendTo($fileDivs);
	var $potentialFile = $("<div></div>").appendTo($fileDivs);
	var $fileButtons = $("<div class='DBS_buttons'></div>").appendTo($fileRow2).hide();
	var $progress = $("<span>0% </span>").appendTo($fileButtons);
	var $closeFiles = $("<i class='KViewPort_tool fa fa-trash'> </i>").appendTo($fileButtons);

	$closeFiles.click(function(){
		clear();
		KViewer.dataManager.delFile(getDBSid("current"));
		KViewer.dataManager.delFile(getDBSid("potential"));
		KViewer.dataManager.delFile(getDBSid("sigma"));
	    var active = electrode.getActive();
	    active.pts.sim_indicator.hide();
		active.pts.voltage_indicator.show();
		KViewer.cacheManager.update();
		for (var x in electrode.onupdate)
			electrode.onupdate[x]();
		active.pts.select();
				


	});


	function getDBSid(which)
	{
		 var active = electrode.getActive();		
		 return "DBS_"+electrode.name+"_"+active.pts.p.name +"_" + which;
	}
	function getDBSfile(which)
	{
		 return KViewer.dataManager.getFile(getDBSid(which));
	}




	panel.updateActive = function()
	{
		 clear();
    	 if (getDBSfile("current") != undefined)
    	 {
	  		showFileinfo("current",getDBSfile("current"),$currentFile);
	  		showFileinfo("potential",getDBSfile("potential"),$potentialFile);
    	 }

		 var active = electrode.getActive();
		 $name.text(electrode.name + "/" + active.pts.p.name);
		 //$clearsim.trigger('click');


	}
	panel.updateActive();



	panel.conduct_nii = undefined


    function ondrop(e) {

			e.preventDefault();
			e.stopPropagation();
			var params = getloadParamsFromDrop(e.originalEvent,{});
			for (var k = 0;k < params.length;k++)
			{
				if (!params.patient_study_drop)
				{
					params[k].callback = function(fobj) {
						if (fobj.contentType == 'nii')
						{
							panel.conduct_nii = fobj;
							update_conduct_nii();
						}
			     		else 
			     			alertify.error("only niftis allowed");

						this.progressSpinner();
					}
					params[k].progressSpinner = panel.progressSpinner;
					KViewer.dataManager.loadData(params[k]);		

				}
			}
     }

	 function update_conduct_nii()
	 {
			$dragarea.children().remove();			
			var fobj = panel.conduct_nii;
			if (fobj != undefined)
			{
				var dragstuff = "draggable='true' data-type='file' data-piz='' data-sid='' data-tag='"+fobj.fileinfo.Tag+"' data-filename='"+fobj.filename+"' data-subfolder='' data-fileID='"+fobj.fileID+"' data-mime='"+fobj.contentType+"'";
				dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";	 	
				var $close = $("<i class='fa fa-fw fa-close'></i>").click(function() { delete panel.conduct_nii; update_conduct_nii();   } );
				$("<div> <div "+dragstuff+">" + fobj.filename + "</div>  </div>").append($close).appendTo($dragarea);
			}
			else
			   $("<span>drop nifti to define conductivity </span>").appendTo($dragarea);

	 }

	 function computeCurrent(current,potential,sigma)
	 {
		 var w = current.wid;
		 var wh = current.widhei;
		 var sig;
		 if (sigma == undefined)
		 	sig = function() {return 1};
		 else
		 {
		 	var nii = sigma.content;
		 	var A = math.multiply(math.inv(nii.edges),potential.edges)._data;
		 	sig = function(x,y,z) { 
		 		var s = trilinInterp(nii,x,y,z,A,0);
		 	 	return s*s;
		 	}
		 }
		 var  pot = potential.data;

		 for (var z = 0;z < current.sizes[2];z++)
			 for (var y = 0;y < current.sizes[1];y++)
				 for (var x = 0;x < current.sizes[0];x++)
				 {
				 	var idx = x+w*y+wh*z;
				 	var d = [pot[idx+1] - pot[idx],pot[idx+w]-pot[idx],pot[idx+wh]-pot[idx]];
				 	current.data[idx] = sig(x,y,z)*
				 						Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
				 	 
				 }


	 }

	 function computeSigma(current,potential,sigma)
	 {
		 var w = current.wid;
		 var wh = current.widhei;
	     var whd = current.sizes[0]*current.sizes[1]*current.sizes[2];
		 var vsize = simParams.boxlen/simParams.numvox;
		 var  pot = potential.data;
		 var current_data = current.data;

		 var fac = vsize*2;

		 for (var z = 0;z < current.sizes[2];z++)
			 for (var y = 0;y < current.sizes[1];y++)
				 for (var x = 0;x < current.sizes[0];x++)
				 {
				 	var idx = x+w*y+wh*z;
				 	var d = [pot[idx+1] - pot[idx-1],pot[idx+w]-pot[idx-w],pot[idx+wh]-pot[idx-wh]];
				 	var i = [current_data[idx],current_data[idx+whd],current_data[idx+whd*2]];
				 	sigma.data[idx] = fac*
										Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2]) /
										Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
				 	 
				 }


	 }

	 function clear()
	 {
		$clearsim.trigger('click')
		$potentialFile.children().remove();
		$currentFile.children().remove();
		$fileButtons.hide();
	 }

	 signalhandler.attach("close",function(){
	 	panel.conduct_nii = undefined;
	 	update_conduct_nii();
	 	panel.close();
		clear();
	//	panel.hide();
	 });


	 var center;
	 function showFileinfo(name,fobj,$div)
	 {
	 	$fileButtons.show();
	 	$div.children().remove();
		var dragstuff = "draggable='true' data-type='file' data-piz='' data-sid='' data-tag='"+fobj.fileinfo.Tag+"' data-filename='"+fobj.filename+"' data-subfolder='' data-fileID='"+fobj.fileID+"' data-mime='"+fobj.contentType+"'";
		dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);'";	 	
	 	var $fi = $("<div class='DBS_result' "+dragstuff+">"+name+"</div>");
	 	$div.append($fi);
	 	$fi.on("click",function(e)
	 	{
	 		loadDataOndblClick(e,function(){
	 			KViewer.currentPoint = math.matrix([center[0],center[1],center[2],1]);
	 			signalhandler.send("centralize positionChange");
	 		})
	 	});
	 }

	function showSimInfo(e)
	{
		var active = electrode.getActive()
		var pts = electrode.getPoints();
		var str = "<br> tip:(" + active.pts.last_simtip + ")";
	    if (pts[1].p.coords.slice(0,3).toString() != active.pts.last_simtip)
	    	str += "<br> (electrode location not consistent)"
		var $info = $("<div class='DBS_siminfo'> progress:"+active.pts.progress+ str+" </div>").appendTo($(document.body));
		$info.css('top',e.clientY).css('left',e.clientX+10);
		return $info;
	}	

	function doSimulation()
	{

			 function getSimDomain(name,fobj,tdim,$div)
			 {
				  var fileObject = getDBSfile(name);
				  if (fileObject == undefined
					  || (fobj.content.sizes[0] != fileObject.content.sizes[0]))
				  {

					  fileObject =  cloneNifti(fobj,getDBSid(name),"float",tdim);
					  fileObject.content.bbox = fobj.content.bbox;
					  fileObject.fileID = getDBSid(name);
					  fileObject.modified = true;
					  fileObject.filename += ".nii";
					  KViewer.dataManager.setFile(fileObject.fileID,fileObject);
					  KViewer.cacheManager.update();
				  }
				  fileObject.content.edges = fobj.content.edges;			  
				  fileObject.content.voxSize = fobj.content.voxSize;			  
				  signalhandler.send("updateFilelink",{id:fileObject.fileID});

				  if ($div != undefined)
				  {
					 showFileinfo(name,fileObject,$div);
					 active.pts.sim_indicator.show();
					 active.pts.voltage_indicator.hide();
					 active.pts.showSimInfo = showSimInfo;
				  }

				  return fileObject;
			 }



			 var pts = electrode.getPoints();
			 var active = electrode.getActive();
			 var active_pos =  active.pos;

			 var size_contact = 0.1;

			 var elecGeometry = {
				tip : pts[1].p.coords.slice(0,3),
				end : pts[0].p.coords.slice(0,3),
				c_min : active_pos-size_contact/2,
				c_max : active_pos+size_contact/2,
				radius : 1
			 };


			  elecGeometry.multipolar = [];
			  for (var k = 2; k < pts.length; k++)
			  {
			  	if (pts[k].p.voltage != undefined && pts[k].p.voltage != 0)
			  	{
			  		var pos = electrode.electrode_properties.contacts[k-2]
			  		var vol = pts[k].p.voltage;
					elecGeometry.multipolar.push({min: pos-size_contact/2 , max: pos+size_contact/2, vol : vol });
					
			  	}
			  }
			  var impedance = 1000;
			  if (elecGeometry.multipolar.length > 0)
			  {
			  	  var m = elecGeometry.multipolar;
			  	  var abssum = 0;
				  for (var k = 0 ; k < m.length; k++)
					  abssum += Math.abs(m[k].vol);
				  for (var k = 0 ; k < m.length; k++)
				  {
				  	  m[k].current =  Math.abs(m[k].vol)/abssum;
				  	  m[k].sign = Math.sign(m[k].vol);
				  }

				  elecGeometry.total_current = abssum/impedance*1000; // (mA)

			  }







			  var tip = elecGeometry.tip;
			  var end = elecGeometry.end;
			  var n = [end[0]-tip[0],end[1]-tip[1],end[2]-tip[2]];
			  var norm = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
			  n[0] /= norm; n[1] /= norm; n[2] /= norm;
			  center = [ tip[0] + active_pos*n[0],
						   tip[1] + active_pos*n[1],	
						   tip[2] + active_pos*n[2]];

			  var boxlen = simParams.boxlen; //mm
			  var numvox = simParams.numvox;

			  var sizes = [numvox,numvox,numvox,1];
			  var voxsz = [boxlen/numvox,boxlen/numvox,boxlen/numvox,1];
			  var bbox = {max: [center[0] + boxlen,center[1] + boxlen,center[2] + boxlen],
						  min: [center[0] - boxlen,center[1] - boxlen,center[2] + boxlen]};

			  var edges = math.matrix(math.diag(voxsz)); 	  
			  for (var i = 0;i < 3;i++)
				   edges._data[i][3] = -sizes[i]/2*voxsz[i] + center[i];	  	
			  var fobj ={ content : {
								  edges: edges,
								  bbox: bbox,
								  voxSize: voxsz,
								  sizes: sizes },				
					   };
			  if (panel.conduct_nii)
				  fobj.fileinfo = panel.conduct_nii.fileinfo;

			  filePotential = getSimDomain("potential",fobj,1,$potentialFile);

			  fileCurrent = getSimDomain("current",fobj,3,$currentFile);

			  fileSigma = getSimDomain("sigma",fobj,1);


			  function packForTransfer(obj,nodata)
			  {
				  if (obj == undefined)
					return undefined;
				  else
				  {
					 var thedata = nodata?undefined:obj.data;
					 return {data:thedata,
							   edges:obj.edges,
							   invedges:math.inv(obj.edges)._data,
							   sizes:obj.sizes,		
							   datascaling:{slope:obj.datascaling.slope,offset:obj.datascaling.offset},
							   wid:obj.wid,		  			   
							   widhei:obj.widhei,
							   widheidep:obj.widheidep};
				  }

			  }



			  var chunks = simParams.num_chunks;
			  simParams.num_particles_ =
				  Math.floor(simParams.num_particles/simParams.num_workers/chunks);

			  var accumVol_potential = new Float32Array(filePotential.content.data.length);
			  for (var k = 0; k < filePotential.content.data.length; k++)
				 accumVol_potential[k] = 0;
			  var accumVol_current = new Float32Array(fileCurrent.content.data.length);
			  for (var k = 0; k < fileCurrent.content.data.length; k++)
				 accumVol_current[k] = 0;


			  var accumCnt = 0;
			  var accumResistance = 0;

			  var numworkers = simParams.num_workers;



			  if (simParams.analytical)
			  {
					chunks = 1;
					numworkers = 1;
			  }


			  swarm = {workers:[],ishold:false};

			  var worker_cnt = 0;
			  var cid = setInterval(function()
			  {
				if (swarm == undefined)
				{	
					clearInterval(cid)
					return;
				}

				if (!swarm.ishold )
				{
					swarm.workers.push(inititateWorker(worker_cnt++))
					if (worker_cnt >= numworkers)
						clearInterval(cid);
				}
			  },500);


			  swarm.kill = function()
			  {
				  for (var k = 0; k < numworkers;k++)
					if (swarm.workers[k] != undefined)
						swarm.workers[k].kill();	  	
			  }
			  swarm.toggle = function()
			  {
				  var laststate;
				  for (var k = 0; k < numworkers;k++)
				  {
					if (swarm.workers[k] != undefined)
						laststate = swarm.workers[k].toggle();	  
				  }
				  swarm.ishold = laststate;
				  return laststate;	
			  }


			  swarm.done = function()
			  {
				  var alldone = true;
				  for (var k = 0; k < numworkers;k++)
					  alldone = alldone && (swarm.workers[k] == undefined);
				  if (alldone)
				  {
						$container.find(".panel").removeClass("inactive");
						KViewer.markerTool.$container.removeClass("inactive")						
						if (accumCnt/chunks/numworkers >= 1)
						{
							active.pts.progress = "done";
							$progress.text("done");							
						}
						panel.progressSpinner();
						$simulate.text("Simulate");				
						$clearsim.addClass("inactive");

						swarm = undefined;
				  }
			  }


			  function accumulateVol(file,vol,data,fac)
			  {
					var len = file.content.data.length;

					for (var k = 0; k < len; k++)
						{
							vol[k] += data[k];
							file.content.data[k] = vol[k] * fac;
						}
			  }

			  function inititateWorker(workerid)
			  {
					var worker = new Worker('KTools/DBSsimulation_worker.js');
					worker.workerid = workerid;
					worker.postMessage = worker.webkitPostMessage || worker.postMessage;
					worker.addEventListener('message', function(e) {


						function updateImages()
						{
								if (filePotential.content == undefined || filePotential.content.data == undefined)
									return;

								for (var x in electrode.onupdate)
									electrode.onupdate[x]();


								filePotential.content.histogram = comphisto(0, 1, 50, filePotential.content.data, filePotential.content.data.length, 5000);
								fileCurrent.content.histogram = comphisto(0, 0.3, 50, fileCurrent.content.data, filePotential.content.data.length, 5000);
								fileSigma.content.histogram = comphisto(0, 3, 50, fileSigma.content.data, fileSigma.content.data.length, 5000);
								signalhandler.send("updateImage",{id:filePotential.fileID});
								signalhandler.send("updateImage",{id:fileCurrent.fileID});					
								signalhandler.send("updateImage",{id:fileSigma.fileID});					
								signalhandler.send('layoutHisto');					
						}

						e = e.data;
						if (e.msg == 'progress')
						{
							var prc = Math.round(100*accumCnt/chunks/numworkers) + "%";
							panel.progressSpinner("simulating " +prc );
							active.pts.progress = prc;
							active.pts.last_simtip = elecGeometry.tip.toString();
							$progress.text(prc );

							accumCnt++

							accumResistance += e.meanResistance;


							var v = voxsz[0];
							var pixvol = v*v*v;

							var R0 = accumResistance/accumCnt/(v*v);
							//console.log(R0);


							var I0 = (accumCnt * simParams.num_particles_ );

							var spec_cond = simParams.alpha*simParams.alpha/2;

		//					var facU = spec_cond*simParams.Voltage / I0                     /pixvol;
		//					var facI = simParams.Voltage/simParams.Impedance/( I0)*     1000/ (v*v);


							var facU = spec_cond/simParams.Conductivity*simParams.Current / I0 /pixvol;

							var facI = simParams.Current /( I0)  / (v*v);


if (simParams.analytical)
{
	facI = simParams.Current;
	facU = 1/simParams.Conductivity*simParams.Current;
}


							accumulateVol(filePotential,accumVol_potential,e.potential_data,facU);
							filePotential.content.descrip = 'unit:V';



							accumulateVol(fileCurrent,accumVol_current,e.current_data,facI)
							fileCurrent.content.descrip = 'unit:mA/mm^2';

							computeSigma(fileCurrent.content,filePotential.content,fileSigma.content);
							fileSigma.content.descrip = 'unit:S/m';


							if (this.workerid == 0)
								updateImages()
						}
						else if (e.msg == 'paused')
						{
							panel.progressSpinner("paused");
						}
						else if (e.msg == 'done')
						{
							updateImages()
							delete swarm.workers[workerid];
							swarm.done();
						}
					}, false);

					worker.kill = function()
					{
						worker.postMessage({message:'kill'},[]);

					}

					var sigma;
					if (panel.conduct_nii)
						sigma = panel.conduct_nii.content;

					worker.start = function() {			

						worker.postMessage({message:'startSim',
							elecGeometry:elecGeometry,
							simParams:simParams,
							chunks:chunks,
							potential:packForTransfer(filePotential.content,true),
							current:packForTransfer(fileCurrent.content,true),
							sigma:packForTransfer(sigma,false)  } 	,[]);
					}

					worker.ishold = false;
					worker.toggle = function() {			
						if (worker.ishold)
						{
							worker.postMessage({message:'continue'}	,[]);
							worker.ishold = false;
						}
						else
						{
							worker.postMessage({message:'hold'}	,[]);
							worker.ishold = true;
						}
						return worker.ishold;
					}


					worker.start();
					return worker;

			  }

	}



	return panel;

}



function KPickingPanel(mset)
{

    var panel = KPanel($(document.body),mset.uuid + mset.name,"Picking Panel: " + mset.name);
    panel.closeOnCloseAll = true
	var $container = panel.$container;


	var cid = -1;
    var $contrastsRow = $("<div ></div>").appendTo(panel.$container);

    var $fileRow2 = $("<div class='panel'></div>").appendTo(panel.$container);





    panel.contrasts = {};
	var $wrap = $("<div class='annotation_tool_elemDIV' ></div>").appendTo($fileRow2);

	var $dragarea = $("<div dragover='return false'; class='annotation_tool_droparea' style='height:40px !important;'><span>drop nifti to for sensing</span></div>").appendTo($wrap);
	panel.$container.on("dragover", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
	panel.$container.on("dragleave", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
	panel.$container.on("drop",ondrop);
	panel.$container.width(400);

    panel.objectify = function()
    {
    	return {contrasts:panel.contrasts};
    }
    panel.load = function(state)
    {
        panel.contrasts = {};
        var cs = Object.keys(state.contrasts)

        for (var k = 0;k < cs.length;k++)
        {
        	panel.contrasts[cs[k]] = cs[k]
            KViewer.dataManager.loadData({
                URLType: 'serverfile',
                fileID: cs[k],
                callback: update_contrasts
            });
        }
    	
	
    }

    function ondrop(e) {

			e.preventDefault();
			e.stopPropagation();
			var params = getloadParamsFromDrop(e.originalEvent,{});
			for (var k = 0;k < params.length;k++)
			{
				if (!params.patient_study_drop)
				{
					params[k].callback = function(fobj) {
						if (fobj.contentType == 'nii')
						{
							panel.contrasts[fobj.fileID] = fobj.fileID;
							update_contrasts();
						}
			     		else 
			     			alertify.error("only niftis allowed");

						this.progressSpinner();
					}
					params[k].progressSpinner = panel.progressSpinner;
					KViewer.dataManager.loadData(params[k]);		

				}
			}
     }

     function getVals(c)
     {
     	var nii = c.content;
     	var invedges = math.inv(nii.edges);
     	var volsz =  nii.sizes[0]*nii.sizes[1]*nii.sizes[2];
     
        var points = mset.getPoints();
        var res = [];
        for (var j = 0; j < points.length;j++)
        {
        	if (points[j].p.name != "tip" & points[j].p.name != "end" )
        	{
				var point = points[j].p.coords;
				var vals = [];
				for (var k = 0;k < nii.numTimePoints;k++)
					   vals.push(Math.abs(trilinInterp(nii, point[0], point[1], point[2], invedges._data, volsz*k)))
				res.push({name:points[j].p.name,vals:vals})
        	}
        }
        return res;
     }

     panel.cid = -1;

     function update_contrasts()
     {
     	if (panel.cid != -1)
     	    clearTimeout(panel.cid);
     	panel.cid = setTimeout(function() {

     	 panel.cid  = -1;

     	 $contrastsRow.children().remove()
     	 var contrasts = Object.keys(panel.contrasts);
         for (var k = 0; k < contrasts.length;k++)
         {
         	var fobj = KViewer.dataManager.getFile(contrasts[k])
         	if (fobj != undefined)
         	{
				var name =fobj.filename;

				var $c = $("<div class=KPickerPanelLargeHead><span>"+name+"</span></div>");
				$c.append( $("<i class='KPickerPanelDrop fa fa-trash'> </i>").click(function(id) { return function() { 
					delete panel.contrasts[id]; update_contrasts(); }} (fobj.fileID) ) );

				var res = getVals(fobj)
				for (var j = 0; j < res.length;j++)
				{
					var str = "<span  class=KPickerPanelSmallHead>" + res[j].name + ": </span>";
					if (res[j].vals.length == 1)	
					{			
						str += "<span>" + res[j].vals[0]+ "</span>";
						$("<div class=KPickerPanelSmallRow>" + str + "</div").appendTo($c);
					}
					else if (res[j].vals.length < 5)	
					{
						var maxi = math.sum(res[j].vals);
						for (var l = 0; l < res[j].vals.length;l++)
						{
							var w = Math.abs(res[j].vals[l]/maxi*100).toFixed(0);
							str += "<div class=KPickingPanelHist style='height:"+w+"%'>" +w+ "</div>";
						}

						$("<div class=KPickerPanelRow>" + str + "</div").appendTo($c);
					}
					else
					{
						var maxi = math.max(res[j].vals);
						for (var l = 0; l < res[j].vals.length;l++)
						{
							var w = Math.abs(res[j].vals[l]/maxi*100).toFixed(0);
							str += "<div class=KPickingPanelHistDense style='height:"+w+"%'></div>";
						}

						$("<div class=KPickerPanelRow>" + str + "</div").appendTo($c);
					}




				}


				$c.appendTo($contrastsRow)
         	}
         }

     	},100);

     }

     mset.onupdate['pickerpanel'] = function(){
		 var arr = mset.getPoints()
		 for (var k = 0; k < arr.length;k++)
		     arr[k].onupdate['pickerpanel'] = update_contrasts;

     }

     mset.onupdate['pickerpanel']();

     return panel;

}