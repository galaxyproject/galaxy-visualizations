




function KMedImgCurve(medviewer)
{
	/******************************************************************************
	specifications
	*******************************************************************************/
	/* This tool is supposed to:
		- draw lines: spectra, cross sections, time series, ...
		- draw multiple lines: compare multiple images -> use "overlay" to draw multiple contrast.
		  allow to scale multi-contrast among each other
		- draw mean curves of ROIs: use "drop as roi interface"
		- scale x-axis: true time, common scale for multiple rois
		- scale y-axis: normalise to max, baselinelength-max, native units

		- log plot


		- correlation plot: correlate multiple contrasts / time series, (VSI GE / SE spirals ...) 



	*/



	/******************************************************************************
	as a seperate tool?
	*******************************************************************************/
	// as a tool ?
	var $menu = $("<ul class='KView_tool_menu'></ul>").append($("<li></li>"));
    var $thetog = $("<div class='KView_tool '><i class='fa fa-pencil fa-1x'></i></div>").append($menu);
    var that = new KToolWindow(KViewer, $thetog);

    that.$leftToolistDiv.remove();

	that.resize = function(hei)
	  {
      that.$container.height(hei);
      $curvecontainer.height(hei-that.$container.find('.KToolsTopMenu').height());
      
 	 }
	var $target = that.$container;

    that.tstate.target = -1;

    that.name = 'CurveTool';
 



	/******************************************************************************
	The differnet modi
	*******************************************************************************/
	var $modesel = $("<ul></ul>").appendTo( $("<li><a><i class='fa fa-list-ul'></i>Mode  </a></li>").appendTo(that.$topRow)  );
		 $("<li myid='tseries'><a>Time Series</a></li>").appendTo($modesel).click( function(){  setstate('mode', 'tseries') })  ;
		 $("<li myid='vsi'><a>VSI Spiral</a></li>" ).appendTo($modesel).click( function(){  setstate('mode', 'vsi') })  ;
		 $("<li myid='dce_patlak'><a>DCE Patlak</a></li>" ).appendTo($modesel).click( function(){  setstate('mode', 'dce_patlak') })  ;
		 $("<li myid='histogram'><a>Histograms</a></li>" ).appendTo($modesel).click( function(){  setstate('mode', 'histogram') })  ;
	
	var $normalise = $("<ul></ul>").appendTo( $("<li><a><i class='fa fa-arrows-v'></i>Scaling </a></li>").appendTo(that.$topRow)  );
		 $("<li myid='noscaling'><a>No scaling</a></li>" ).appendTo($normalise).click( function(){  setstate('normalise', 'noscaling') })  ;
		 $("<li myid='individual_max'><a>Individually to min_max </a></li>").appendTo($normalise).click( function(){  setstate('normalise', 'individual_max') })  ;
		 $("<li myid='individual_area'><a>Individually to area</a></li>").appendTo($normalise).click( function(){  setstate('normalise', 'individual_area') })  ;
		 $("<li myid='individual_lastpoint'><a>Individually to last point</a></li>").appendTo($normalise).click( function(){  setstate('normalise', 'individual_lastpoint') })  ;
		  $normalise.append($("<hr width='100%'> ")); 			
	 var $yscaling = $("<li myid='yscaling'><a>Y-Scaling <input value='1'> </a></li>").appendTo($normalise).change( function(e){		 	 
		 	 state.yscaling = $yscaling.find('input').val();
		 	 drawAllCurves();
		 	   })  ;
	 var $xscaling = $("<li myid='yscaling'><a>X-Scaling <input value='1'> </a></li>").appendTo($normalise).change( function(e){		 	 
		 	 state.xscaling = $xscaling.find('input').val();
		 	 drawAllCurves();
		 	   })  ;
	
	var $baselinelength = $("<ul></ul>").appendTo( $("<li><a><i class='fa fa-window-minimize'></i>Baseline </a></li>").appendTo(that.$topRow)  );
		 $("<li myid='off'><a>None</a></li>" ).appendTo($baselinelength).click( function(){  setstate('baselinelength', 'off') })  ;
		 $("<li myid='1'><a>First point</a></li>" ).appendTo($baselinelength).click( function(){  setstate('baselinelength', 1) })  ;
		 $("<li myid='8'><a>First 8 points</a></li>").appendTo($baselinelength).click( function(){  setstate('baselinelength', 8) })  ;


	/*************************************
	download curves
	************************************/
	if(1)
	{
		var $downloadcurves = $("<li><a> <i class='fa fa-copy'></i>Copy to clipboard</a></li>").appendTo(that.$topRow);
		$downloadcurves.click( function(){downloadcurves()});
	}	

	/*************************************
	rebuild the tool, for development
	************************************/
	if(0)
	{
		var $rebuild = $("<li><a> <i class='fa fa-wrench'></i> RebuildTool</a></li>").appendTo(that.$topRow);
		$rebuild.mousedown( function(){
			//that.close();
			var x = KToolWindow.findToolbyContainer(that.$container)
			ktoolslist[7] = KViewer.curveTool = KMedImgCurve();
			that.$container.remove();
			KViewer.curveTool.show();

		});	
	}

	

	var state = 
	{
		normalise: 'individual_max',
		baselinelength: 0,
		mode: 'tseries',
	}
	var $state = 
	{
		normalise: $normalise,
		baselinelength: $baselinelength,
		mode: $modesel,
	}
	
	function setstate(which, value)
	{
		state[which] = value;
		$state[which].children().css('font-weight', '');
		$state[which].find("[myid="+value+"]").css('font-weight', 'bold');

		if (which == "mode")
			updateCurveListHandlers();
	    if (which == "yscaling")
	    	$yscaling.find('input').val(value);
	    if (which == "xscaling")
	    	$xscaling.find('input').val(value);

		drawAllCurves();
	}

	that.setState = function(st)
	{
		for (var k in st)
		{
			state[k] = st[k];
			if ($state[k] != undefined)
			{
				$state[k].children().css('font-weight', '');
				$state[k].find("[myid="+st[k]+"]").css('font-weight', 'bold');							
			}
			if (k == "yscaling")
	    		$yscaling.find('input').val(st[k]);
			if (k == "xscaling")
	    		$xscaling.find('input').val(st[k]);
		}

		updateCurveListHandlers();

		drawAllCurves();
	}


	function getState()
    {
       
        return state;

    }
    that.getState = getState


	/******************************************************************************
	Show as viewer like medviewer?  not for now
	*******************************************************************************/
	if(0)
	{
		medviewer = medviewer || KViewer.viewports[0].getCurrentViewer();
		if(medviewer==undefined)
			return false;

		var viewport = medviewer.viewport;
		var that = new KPrototypeViewer( viewport, KViewer)

		viewport.setCurrentViewer(that);

		var $target = viewport.$container;
		//  medviewer.curveviewer = that;
		// 	medviewer.$container.find('.KViewPort_curvecontainer').remove();
		// 	$('.KViewPort_curvecontainer').remove();
	}

	

	/******************************************************************************
	The main curve container
	*******************************************************************************/
    var $curvecontainer = $("<div class='KViewPort_curvecontainer sbox_horz' style='height:100%;position:relative;' ></div>" )

	var $box = $("<div class='KViewPort_curvecontainer_list  sbox_resizable' ></div>").appendTo($curvecontainer);
	sbox.appendResizer($box); 

    var $svgcontainer = $("<div class='KViewPort_curvecontainer KViewPort_svgcontainer sbox_resizable' style='display:flex;height:100%;width:100%;position:relative;' ></div>" ).appendTo($curvecontainer);
    var $isvgcontainer = $("<div class='' style='display:flex;height:100%;width:100%;position:relative;' ></div>" ).appendTo($svgcontainer);
    //var $axcontainer  = $("<div class='KViewPort_curvecontainer sbox_resizable' style='display:flex;height:100%;width:100%;position:relative;background:green;' ></div>" ).appendTo($curvecontainer);
   

	/******************************************************************************
	prep the svg
	*******************************************************************************/
	// values are in percent defined by viewbox
	// given as x0 y0 width height
	//var str  =  "<svg  preserveAspectRatio='none' viewbox='-10 -10 120 120' style='transform: scaleY(-1);' class='sbox_resizable' __style='width:100%;' >";
	var str  =  "<svg  preserveAspectRatio='none' viewbox='-0 0 100 100' style='transform: scaleY(-1);' class='sbox_resizable' >";
	
// 	str += '<defs>';
// 	str += '<marker id="marker-circle" markerWidth=".03" markerHeight="400" refx=".5" refy=".5" viewBox="0 0 1 100" preserveAspectRatio="xMinYMin"><circle cx="1" cy="1" r="2" class="marker" fill="green"/></marker>';
// 	str += '</defs>';


	/******************************************************************************
	axes 
	*******************************************************************************/
	str +=  "<line x1=-0 y1=0 x2=100 y2=00 style='stroke:white;stroke-width:.2' />";
	str +=  "<line x1=0 y1=0 x2=00 y2=100 style='stroke:white;stroke-width:.2' />";
	

    var $ylabel = $("<div class='' style='position:absolute;text-align:right; left:-60px; transform:rotate(-90deg); top:50%' >no ylabel</div>").appendTo($isvgcontainer);
    var $xlabel = $("<div class='' style='position:absolute;text-align:right; left:50%; bottom:-35px' >no xlabel</div>").appendTo($isvgcontainer);
	/******************************************************************************
	gridlines
	*******************************************************************************/
	if(1)
	{
		var xticklabels = [];
		var yticklabels = [];
		str +=  "<g class='curveTool_grid_major' >";
		// prepare some (20) curves. must be prepared ind advance, svg cannot be appended
		ngridh = 26;
		ngridv = 16;
		ysize = 100;
		xsize = 100;

		for(var k=0; k<ngridh; k++)
		{
			var cx = k/(ngridh-1)*xsize;
			str +=   "<line class='KViewPort_curvetool_gridline curveTool_grid_horzlines'  y1="+cx+ " x1=0 y2="+cx+" x2="+100+"  />";
 		    var $text = $("<div class='' style='position:absolute;text-align:right; left:-5px; transform:translate(-100%,-60%); top:"+(ysize-cx)+"%' >"+cx+"</div>").appendTo($isvgcontainer);
 		    yticklabels.push($text);
		}
		for(var k=0; k<ngridv; k++)
		{
			var cx = k/(ngridv-1)*ysize ;
			str +=   "<line class='KViewPort_curvetool_gridline curveTool_grid_vertlines' x1="+cx+ " y1=-0.5 x2="+cx+" y2="+(ysize)+" />";
 		    var $text = $("<div class='' style='position:absolute;text-align:right; bottom:-10px; transform:translate(-50%,50%); left:"+(cx)+"%' >"+k+"</div>").appendTo($isvgcontainer);
 		    xticklabels.push($text);
		}
		str +=   "<line class='KViewPort_curvetool_timeline ' x1="+0+ " y1=0 x2="+0+" y2=100 />";
		str +=  "</g>";
	}


	/******************************************************************************
	curevgroup with lines
	*******************************************************************************/
	str +=  "<g class='curveTool_curvegroup_lines' >";
	for(var k=0; k<20; k++)
	{
		str +=  "<polyline points='0,0' style='fill:none;stroke:red;stroke-width:2;visibility:hidden' />";
	}
	str +=  "</g>";
	str += "</svg>";
	var $svg = $(str).appendTo($isvgcontainer);

	// xlims (zoom / pan)  can be applied to the whole curve group.
	var $curvegroup = $svg.find('.curveTool_curvegroup_lines');
	var $curves = $svg.find('polyline');


	// xlims (zoom / pan)  can be applied to the whole curve group.
	var $gridgroup = $svg.find('.curveTool_grid_major');
	var $gridlinesvert = $svg.find('.curveTool_grid_vertlines');
	var $gridlineshorz = $svg.find('.curveTool_grid_horzlines');

	var $currenttimeline   = $svg.find('.KViewPort_curvetool_timeline');


	/******************************************************************************
	mousedown
	*******************************************************************************/
	$svg.on('mousedown', svgmousedown)
	function svgmousedown(ev)
	{
		function svgmouseup(ev)
		{
			$body.off("mousemove mouseup mouseleave")
		}
		$body.on('mousemove', svgmousemove)
		$body.on('mouseup mouseleave', svgmouseup)
		svgmousemove(ev);
	}
	
	function svgmousemove(ev)	
	{
		var val = Math.round( (ev.clientX - $svg.offset().left)/$svg.width()*maxnumtimepoints);
		var master = KViewer;
		
 		if(master.movie.currentTimePoint == val)
 			return;

		master.movie.currentTimePoint = val;
		master.iterateMedViewers(function(m)
		{
			if (m.nii !=undefined && m.nii.numTimePoints > 1 & m.movieGlobalMode)
			{
				m.updateCurrentTimePoint(val);
			}

		});

    }

	/******************************************************************************
	mouswheel
	*******************************************************************************/
	if ($svg.get(0).addEventListener) {
        // Firefox
        if (/Firefox/i.test(navigator.userAgent))
            $svg.get(0).addEventListener("DOMMouseScroll", moveUnlagger(MouseWheelHandler_), false);
        else
        // IE9+, Chrome, Safari, Opera
            $svg.get(0).addEventListener("mousewheel", MouseWheelHandler_, false);
    }
    else
    {
        // IE 6/7/8
        $svg.get(0).attachEvent("onmousewheel", MouseWheelHandler);
    }

	function MouseWheelHandler_(ev)
	{
        var amount = (ev.wheelDelta || -ev.detail) > 0 ?1:-1;
        var val =  KViewer.movie.currentTimePoint + amount;
		KViewer.movie.currentTimePoint = val;
		KViewer.iterateMedViewers(function(m)
		{
			if (m.nii !=undefined && m.nii.numTimePoints > 1 & m.movieGlobalMode)
			{
				m.updateCurrentTimePoint(val);
			}

		});
	
	}


	var masterimage;
    
	/******************************************************************************
	a curve object
	*******************************************************************************/
	var curves = {};
	function createCurve(props)
	{
		var curve = new Object;
		curve.xdata = [];
		curve.ydata = [];
		curve.ymax = 1;
		curve.ymin = 0;
		curve.color = 0;
		curve.visible = true;
		curve.linewidth = 2;
		curve.pstr = "";
		curve.type = 'singlevox';
		curve.dasharray = "none";

		$.extend(true, curve, props)

		return curve;
	}
	


	/******************************************************************************
	the list of potential curves from the datamanager
	*******************************************************************************/
	var mainList = {};
	var roiList = {};
	var colorcount = 0;
	// these structues will contain: 
	//	- filobj:    referenct to nii obj
	//	- curveobj:  an object containing all the necessary curve data

	function updateCurveList_main()
	{
		var tlist = KViewer.dataManager.getFileList();
		
		// remove deleted items first
		for(var k in mainList)
		{
			if(tlist.indexOf(k) ==-1)
			{
				if(masterimage == mainList[k])
				{
					masterimage = undefined;
					updateCurveData_rois();
				}
				
				// reset curve data
				mainList[k].curveobj.xdata = [];
				mainList[k].curveobj.ydata = [];
				delete mainList[k];
			}
		}

		// set master to first on initial
		if(masterimage == undefined &  Object.getOwnPropertyNames(mainList).length == 0  && tlist.length > 0)
			var reinitMaster = true;
		else
			var reinitMaster = false;

		var newfound = false
		for(var k=0; k<tlist.length; k++)
		{
			var tfile = KViewer.dataManager.getFile( tlist[k] );
			if(tfile.contentType == "nii" && tfile.content!=undefined) // && tfile.content.numTimePoints>1)
			{
 				var fid = tfile.fileID;
  				// only add non-rois here
  				if(!(tfile.fileinfo.Tag && tfile.fileinfo.Tag.search('mask') >-1 ))
 				{
 					if(mainList[fid] == undefined)
 					{
 						newfound = true;
						mainList[fid] = {
							fileobj:  tfile,
							isTSeries: tfile.content.numTimePoints>1,
							curveobj: createCurve( {color: colorcount%KColor.list.length })

							};
						colorcount++;	
 					}
 				}
			}
		}
		
		if(reinitMaster)
			setMaster();

		// this is somewhat doubled, but we need to do this
		// list can change on pushROI, delROI, closeAll, ...
		if(newfound)
		{
			updateCurveData_main();
			updateCurveList_rois()
		}


	}
	
	function updateCurveList_rois()
	{
		if (KViewer.roiTool != undefined)
		{
			var baselist = Object.getOwnPropertyNames( KViewer.roiTool.ROIs);
			for(var k in roiList)
			{
				if(baselist.indexOf(k) ==-1)
				{
					// reset curve data
					roiList[k].curveobj.xdata = [];
					roiList[k].curveobj.ydata = [];

					delete roiList[k];
				}

			}

			for(var k in KViewer.roiTool.ROIs)
			{
				var tfile =  KViewer.roiTool.ROIs[k]
				if(roiList[k] == undefined)
				{
					KViewer.roiTool.ROIs[k]
					roiList[k] = {
							fileobj:  tfile,
							curveobj: createCurve({type: 'roi', _dasharray:'5,5', linewidth:'5',  color:tfile.color, visible:state.mode=='histogram'})
						};
				}
			}
		}
		// the GUI handles to enable / disable curves ...
		updateCurveListHandlers();
		drawAllCurves();
		//updateCurveData_main();
	}

	that.updateCurveList_main = updateCurveList_main;
	that.updateCurveList_rois = updateCurveList_rois;
	




	/******************************************************************************
	a general switcher
	*******************************************************************************/
	function KSwitch(options_in)
	{
		var that = {};
		that.options = 
		{
			callback:undefined,
			size:1
		}
		$.extend(true, that.options, options_in);

		that.$div   = $("<div class='KSwitch'></div>");
		that.$button = $("<div class='KSwitch_button KSwitch_disabled'></div>").appendTo(that.$div);
		that.state = 0;
		
		that.setState = function(state)
		{
			that.state = state;
			if(that.state)
				that.$button.addClass('KSwitch_enabled').removeClass('KSwitch_disabled');
			else
				that.$button.removeClass('KSwitch_enabled').addClass('KSwitch_disabled');
			
			return that;
		}

		that.appendTo = function($target)
		{
			that.$div.appendTo($target);
			return that;
		}

		that.switch = function(newstate)
		{

			that.setState(newstate==undefined?!that.state:newstate);
			if(that.options.callback)
			{
				that.options.callback(that);
			}
		}

		that.$div.click( function()
		{
			that.switch();
// 			that.setState(!that.state);
// 			if(that.options.callback)
// 			{
// 				that.options.callback(that);
// 			}
		} );

		that.setCallback = function(callback)
		{
			that.options.callback = callback;
			return that;
		}

		return that;
	}

	/******************************************************************************
	the GUI handlers
	*******************************************************************************/

	var handlers = {};
 	handlers.main = {};
 	handlers.ROIs = {};

	that.meanROIMasters = [];
	

	function updateCurveListHandlers()
	{
		$box.empty();
		var $main  = $("<div class='' style =''></div>").appendTo($box);
		if (state.mode != "histogram")
		{
			var $srow_single = $("<div class='KViewPort_curvecontainer_listTitle'></div>").appendTo($main);
			var $title = $("<div class=''><b>Single voxel curves</b></div>").appendTo($srow_single);
			$("<div class='flexspacer'></div>").appendTo($srow_single);
// 			var tswitch = new KSwitch({callback: function(s){ toggle_singleVoxelCurve("all", s.state)}  })
// 							.$div.appendTo( $srow )

			var $showhideall = $("<div class='KViewPort_curvecontainer_showHideAll'></div>").appendTo($srow_single);
			var $hideall = $("<div class='KViewPort_tool'><i class='fa fa-eye-slash'></i></div>").appendTo($showhideall).click( function(ev){toggle_singleVoxelCurve("all", 0)} );
			var $showall = $("<div class='KViewPort_tool'><i class='fa fa-eye'></div>").appendTo($showhideall).click( function(ev){toggle_singleVoxelCurve("all", 1)} );
		}
		var $rois  = $("<div class='' style =''></div>").appendTo($box);
		var $srow = $("<div class='KViewPort_curvecontainer_listTitle'></div>").appendTo($rois);

		if (state.mode == 'histogram')
			var $title = $("<div class=''><b>Histogram over</b></div>").appendTo($srow);
		else
			var $title = $("<div class=''><b>Mean curve over</b></div>").appendTo($srow);

		var $mastersel = $("<select class='flexspacer' style='margin-left:0px'></select>").appendTo( $srow )
		//$mastersel.change(function(k,$e){return function(){ setMaster(k,$e) }}(k,$master)  );
		$mastersel.click(function(ev){ setMaster( $(this).val() )});

		var $showhideall = $("<div class='KViewPort_curvecontainer_showHideAll'></div>").appendTo($srow);
		var $hideall = $("<div class='KViewPort_tool'><i class='fa fa-eye-slash'></i></div>").appendTo($showhideall).click( function(ev){toggle_ROIMeanCurve("all", 0)} );
		var $showall = $("<div class='KViewPort_tool'><i class='fa fa-eye'></div>").appendTo($showhideall).click( function(ev){toggle_ROIMeanCurve("all", 1)} );


//		var $histpar_bins = $("<div class='KViewPort_curvetoolinput'><div>#bins:</div>  <input/> </div>").appendTo($srow);
//		var $histpar_min = $("<div class='KViewPort_curvetoolinput'><div>min:</div> <input/> </div>").appendTo($srow);
//		var $histpar_max = $("<div class='KViewPort_curvetoolinput'><div>max:</div> <input/> </div>").appendTo($srow);


//KMouseSlider( $histpar_bins, {min:0, incrementPerPixel: .1 });
//KMouseSlider( $histpar_min, {min:0, incrementPerPixel: .1 });

		for(var k in mainList)
		{
			var fobj = mainList[k].fileobj;
			var ID = fobj.fileID;
			//var name = fobj.fileinfo.SubFolder + fobj.fileinfo.Filename;
			//var name = fobj.fileinfo.Filename;
			var name = fobj.filename;

		
			$mastersel.append( $("<option value='"+k+"'>"+ name+" </option>") )

			var $row1  = $("<div class='KViewPort_curvecontainer_item'></div>").appendTo($main);

			var	$colorselector = KColorSelectorSimple($("<div class='' style='width:18px'></div>"),  setcolor(mainList[k]), mainList[k].curveobj).appendTo($row1);
			var $div   = $("<div class=''>"+name+ "</div>").appendTo($row1);
			$("<div class='flexspacer'></div>").appendTo($row1);


// 			var tswitch = new KSwitch()
// 							.setCallback( function(k){ return function(s){ toggle_singleVoxelCurve(k)  } }(k))
// 							.setState(  mainList[k].curveobj.visible )
// 							.appendTo( $row1 );


			var $eye = $("<i class='fa'></i>").appendTo( $row1 )

			$row1.click( function(k){ return function(ev){toggle_singleVoxelCurve(k)}}(k)  );
			
			if (state.mode == "histogram" | !mainList[k].isTSeries)
				$row1.hide();
			


			mainList[k].curveobj.handles = {
				$row:$row1,
				$eye: $eye,
				$namediv: $div,
				//tswitch:tswitch
				};

			setCurveToggleState( mainList[k].curveobj )

		}

    	if(masterimage!=undefined)
    	{
    		$mastersel.val(masterimage.fileobj.fileID);
    	}
    	else
    	{
			$mastersel.val('deselect');
    	}

		/*******************************************/

		if (Object.keys(roiList).length == 0)
		{
				var $row1  = $("<div class='KViewPort_curvecontainer_item' style =''></div>").appendTo($rois);

				var $div = $("<div class='KViewPort_curvecontainer_name'> no ROI defined </div>").appendTo($row1);


		}
		else
			for(var k in roiList)
			{
				var fobj = roiList[k].fileobj;
				var ID = fobj.fileID;
				//var name = fobj.fileinfo.SubFolder + fobj.fileinfo.Filename;
				var name = fobj.filename;
				var $row1  = $("<div class='KViewPort_curvecontainer_item' style =''></div>").appendTo($rois);
				var	$colorselector = KColorSelectorSimple($("<div class='' style='width:18px;'></div>"),  setcolor(roiList[k]), roiList[k].curveobj).appendTo($row1);

				var $div = $("<div class='KViewPort_curvecontainer_name'>"+name+ "</div>").appendTo($row1);

				$("<div class='flexspacer'></div>").appendTo($row1);
				var $eye = $("<i class='fa'></i>").appendTo( $row1 );

				$row1.click( function(k){ return function(ev){toggle_ROIMeanCurve(k)}}(k)   );

				roiList[k].curveobj.handles = {
					$row:$row1,
					$eye: $eye,
					$namediv: $div
					};

				setCurveToggleState(roiList[k].curveobj)
			}

		updateCurveData_rois();		
		drawAllCurves();


	}

	/******************************************************************************
	setColor (closure function)
	*******************************************************************************/
	function setcolor(obj)
	{
		return function(color)
		{
			KViewer.roiTool.setColorGlobal(obj.fileobj.fileID , color )
			var c = color = KColor.findColorIndex(color.color);    
			obj.curveobj.color = c;
			drawAllCurves();
		}
	}

	/******************************************************************************
	toggleCurveVisibleState
	*******************************************************************************/
	function setCurveToggleState(curveobj)
	{
		if(!curveobj.visible)
		{
			curveobj.handles.$eye.addClass('fa-eye-slash').removeClass('fa-eye').css('color', '');
			curveobj.handles.$row.css('color', 'hsl(0,0%,60%)');
		}
		else
		{
			curveobj.handles.$eye.addClass('fa-eye').removeClass('fa-eye-slash').css('color', '');
			curveobj.handles.$row.css('color', '');
		}
	
	}

	/******************************************************************************
	toggleSingleCurve
	*******************************************************************************/
	function toggle_singleVoxelCurve(id, state)
	{
		if(id=="all")
		{
			for(var k in mainList)
			{
				//mainList[k].curveobj.handles.tswitch.switch(state);
				toggle_singleVoxelCurve(k, state)
			}
		}
		if(mainList[id]==undefined)
			return 

		var obj = mainList[id];
		obj.curveobj.visible =    state==undefined?!obj.curveobj.visible:state;
		setCurveToggleState(obj.curveobj)

		if(obj.curveobj.visible)
			calcCurveData(obj.curveobj, obj.fileobj.content);
		else
			drawAllCurves();
	}

	/******************************************************************************
	toggleSingleCurve
	*******************************************************************************/
	function toggle_ROIMeanCurve(id, state)
	{
		if(id=="all")
		{
			for(var k in roiList)
				toggle_ROIMeanCurve(k, state)
		}
		if(roiList[id]==undefined)
			return 
			
		var obj = roiList[id];
		obj.curveobj.visible =    state==undefined?!obj.curveobj.visible:state;
		setCurveToggleState(obj.curveobj)

		if(obj.curveobj.visible)
			if(masterimage!=undefined)
			{
				calcCurveData(obj.curveobj, masterimage.fileobj.content, obj.fileobj);
				drawAllCurves();
			}
			else
			{
				obj.curveobj.xdata = [];
				obj.curveobj.ydata = [];
			}

		else
			drawAllCurves();
	}




	/******************************************************************************
	the master curve for the rois
	*******************************************************************************/
	function setMaster(id, $elem)
	{
		if(id == undefined)
		{
			var t = Object.getOwnPropertyNames(mainList);
			if(t.length>0)
				id = t[0];
			else
				return

		}
		masterimage = mainList[ id ]
		updateCurveData_rois();
	}

	/******************************************************************************
	extract the data for the single voxel curves
	*******************************************************************************/
	function updateCurveData_main()
	{
		if (state.mode != 'histogram')
		{
			for(var k in mainList)
			{
				var obj = mainList[k];
				if (obj.isTSeries)
				    calcCurveData(obj.curveobj, obj.fileobj.content);
			}

			if(state.mode == 'vsi')
			{
				var clist = Object.getOwnPropertyNames(mainList);
				for(var c=0; c<clist.length; c+=2)
				{
					var obj1 = mainList[clist[c]]
					var obj2 = mainList[clist[c+1]]
					if(obj2 && obj2 )
					{
						var obj1 = obj1.curveobj
						var obj2 = obj2.curveobj
						for(var k=0; k< obj1.xdata.length; k++)
						{
							obj1.xdata[k] = obj2.ydata[k]/obj2.ymax*600;
						}
					}
					//delete mainList[clist[c+1]];
					
				}
			}
			drawAllCurves();
		}
	}
	that.updateCurveData_main = updateCurveData_main;



	that.updaterois = -1;
	/******************************************************************************
	extract the data for the ROI curves : this can be quite expensive, so it is an extra function
	*******************************************************************************/
	function updateCurveData_rois( roiid )
	{

		//if (that.updaterois != -1)
		//	clearTimeout(that.updaterois);
		//that.updaterois = setTimeout(doit,150);


		var keys = Object.keys(roiList);
		
		doit();

		function doit()
		{

			var k = keys.splice(0,1);
			if (k.length == 0)
				return;

			var obj = roiList[k];
			if(obj.curveobj.visible)
			{
				if(roiid == undefined || roiid.id == k)
				if(masterimage!=undefined)
				{
					calcCurveData(obj.curveobj, masterimage.fileobj.content, obj.fileobj, function (){
						drawAllCurves();
						doit();						
					});
					return;
				}
				else
				{
					obj.curveobj.xdata = [];
					obj.curveobj.ydata = [];
				}

			}		
			doit();
		}

	}
	that.updateCurveData_rois = updateCurveData_rois;
	var maxnumtimepoints = 0;
   	var seqinfo;
	
	/******************************************************************************
	plot all curves for this medviewer
	*******************************************************************************/
    function drawAllCurves()
    {

    	for (var k in mainList)
    	{
			if (mainList[k] && mainList[k].fileobj)
			{
				seqinfo = mainList[k].fileobj.seqinfo;
				break;
			}
    	}
    	    
		var yscaling = parseFloatEval(state.yscaling,seqinfo);
		if (isNaN(yscaling))
			yscaling = 1;
		var xscaling = parseFloatEval(state.xscaling,seqinfo);
		if (isNaN(xscaling))
			xscaling = 1;
		if (typeof state.yscaling == "string")
		{
			var labeling = state.yscaling.split(" ");
			if (labeling[1] != undefined)
				$ylabel.text(labeling[1])
		}
		if (typeof state.xscaling == "string")
		{
			var labeling = state.xscaling.split(" ");
			if (labeling[1] != undefined)
				$xlabel.text(labeling[1])
		}


		// find the max / min off all curves
		var ymaxtot = -10000000;
		var ymintot =  10000000;
		var minnumtimepoints = 100000000;
		maxnumtimepoints = -100000000;

		if (state.mode != "histogram")	
		{
			minnumtimepoints = 0;
			for(var k in mainList )
			{
				var obj = mainList[k].curveobj;
				if(!obj.visible)
					continue;
				if(obj.ymax !=undefined && obj.ymax > ymaxtot )
					ymaxtot =obj.ymax;
				if(obj.ymin !=undefined && obj.ymin < ymintot)
					ymintot = obj.ymin;

				if(obj.xdata.length > maxnumtimepoints)
					maxnumtimepoints = obj.xdata.length
			}

		}

		for(var k in roiList)
		{
			var obj = roiList[k].curveobj;
			if(!obj.visible)
				continue;
			if(obj.ymax > ymaxtot)
				ymaxtot =obj.ymax;
			if(obj.ymin < ymintot)
				ymintot = obj.ymin;


			if (state.mode == "histogram")
			{
				minnumtimepoints = Math.min(obj.xdata[0],minnumtimepoints)
				maxnumtimepoints = Math.max(obj.xdata[obj.xdata.length-1],maxnumtimepoints);

			}
			else
			{
				if(obj.xdata.length > maxnumtimepoints)
					maxnumtimepoints = obj.xdata.length

			}

		}








	// we have to clean all svg curves first ... not so nice but necessary
 		$curves.attr("points", "");		

   		$curvecontainer.find(".Kcurveinfo").remove();
		var cnt =1;
		var top = 10+ 25*cnt++;
		if (state.mode == "histogram")
		{
			$curvecontainer.append($("<div class='Kcurveinfo' style='top:"+top+"px;'>"
				 +"mean/ sd / #vox </div> "));			
		}
		else
			$curvecontainer.append($("<div class='Kcurveinfo' style='top:"+top+"px;'>"
				 +"min/ max/ AUC </div> "));			

		var curveindex = 0;
		
		//******** main
		if (state.mode != "histogram")
			for(var k in mainList)
			{
				drawcurve(curveindex++,  mainList[k].curveobj);
				if (mainList[k].curveobj.visible && mainList[k].isTSeries)
				{
					var csscol = (new KColor( KColor.list[mainList[k].curveobj.color] )).getCSS();
					var top = 10+ 25*cnt++;

					if (mainList[k].curveobj.ymin != undefined)			
						$curvecontainer.append($("<div class='Kcurveinfo' style='top:"+top+"px;border-color:" +csscol+ "'>"
						 +(yscaling*mainList[k].curveobj.ymin).toFixed(2) + "/ "+(yscaling*mainList[k].curveobj.ymax).toFixed(2) +
						 "/ "+(yscaling*xscaling*mainList[k].curveobj.auc).toFixed(2) +
							 " </div> "));

				}				
			}

		//******** ROIs

		for(var k in roiList)
		{
			drawcurve(curveindex++,  roiList[k].curveobj, [minnumtimepoints,maxnumtimepoints]);

			if (roiList[k].curveobj.visible)
			{
				var csscol = (new KColor( KColor.list[roiList[k].curveobj.color] )).getCSS();
				var top = 10+ 25*cnt++;
				if (state.mode == "histogram")
				{
					if (roiList[k].curveobj.mean != undefined)			
						$curvecontainer.append($("<div class='Kcurveinfo' style='top:"+top+"px;border-color:" +csscol+ "'>"
						 +roiList[k].curveobj.mean.toFixed(2) + "/ "+roiList[k].curveobj.stddev.toFixed(2) +
						 "/ "+roiList[k].curveobj.count +
							 " </div> "));
				}
				else
				{
					if (roiList[k].curveobj.ymin != undefined)			
						$curvecontainer.append($("<div class='Kcurveinfo' style='top:"+top+"px;border-color:" +csscol+ "'>"
						 +(yscaling*roiList[k].curveobj.ymin).toFixed(2) + "/ "+(yscaling*roiList[k].curveobj.ymax).toFixed(2) +
						 "/ "+(yscaling*xscaling*roiList[k].curveobj.auc).toFixed(2) +
							 " </div> "));

				}
			}
		}


        ymaxtot *= yscaling;
        ymintot *= yscaling;

		//******** adjust the x / y lims
		// viewbox reference size is 100, 100
		if(1)
		{

			if (ymaxtot==ymintot)
				return;



			var t = getTicks(ymaxtot, ymintot);
			var yscale = 1/(ymaxtot - ymintot) *100;
			var yshift = -ymintot
			var yshift = -t.position[0];

			var dy1 = ( parseFloat(t.position[t.ticks.length-1]) - t.position[0] );
			var dy2 = ( ymaxtot - t.ticks[0] );
			
			var yscale = 1/(dy1+1e-15 )*100;

	        $curvegroup.attr('transform'," scale(100, " + yscale + ") translate(0, " + yshift + ") ");

	        for(var k=0; k<$gridlineshorz.length; k++)
	        {

	        	if(k < t.ticks.length)
	        	{
	        		var yy = k/(t.ticks.length-1)*dy1/dy1*100;// +  (ymintot - t.ticks[0])/dy2;
	        		if(yy==Infinity)
	        			yy = k/(t.ticks.length-1)*100;
					$($gridlineshorz[k]).attr('y1', yy).attr('y2', yy);
					yticklabels[k].text( t.ticks[k]).css('top', (100-yy)+"%");
	        	}
	        	else
	        	{
					$($gridlineshorz[k]).attr('y1', -1).attr('y2', -1);
					yticklabels[k].text("");
	        	}
	        }

			var xscaling = parseFloatEval(state.xscaling,seqinfo);
			if (isNaN(xscaling))
				xscaling = 1;
			
			var t = getTicks(minnumtimepoints*xscaling, maxnumtimepoints*xscaling);
	        for(var k=0; k<$gridlinesvert.length; k++)
	        {

	        	if(k < t.ticks.length)
	        	{
	        		var yy = k/(t.ticks.length-1)*100;
	        		if(yy==Infinity)
	        			yy = k/(t.ticks.length-1)*100;
					$($gridlinesvert[k]).attr('x1', yy).attr('x2', yy);
					xticklabels[k].text( t.ticks[k]).css('left', (yy)+"%");
					xticklabels[k].css('font-size',9);
	        	}
	        	else
	        	{
					$($gridlinesvert[k]).attr('x1', -1).attr('x2', -1);
					xticklabels[k].text("");
	        	}
	        }
		}
    }


	/******************************************************************************
	downloadcurves
	*******************************************************************************/
	function downloadcurves()
	{

    	for (var k in mainList)
    	{
			if (mainList[k] && mainList[k].fileobj)
			{
				seqinfo = mainList[k].fileobj.seqinfo;
				break;
			}
    	}
    	  

		var yscaling = parseFloatEval(state.yscaling,seqinfo);
		if (isNaN(yscaling))
			yscaling = 1;
		var xscaling = parseFloatEval(state.xscaling,seqinfo);
		if (isNaN(xscaling))
			xscaling = 1;
        var xlabel = "no unit";
        var ylabel = "no unit";

		if (typeof state.yscaling == "string")
		{
			var labeling = state.yscaling.split(" ");
			if (labeling[1] != undefined)
				 ylabel =  (labeling[1])
		}
		if (typeof state.xscaling == "string")
		{
			var labeling = state.xscaling.split(" ");
			if (labeling[1] != undefined)
				 xlabel = (labeling[1])
		}

		var tcurves = [];

		var coltp = [];
		tcurves.push(coltp);
		coltp.push("index("+ xlabel +")");				
		for(var t=0; t<maxnumtimepoints ; t++)
			coltp.push((t*xscaling).toString());



		for(var k in mainList )
		{	
			var obj = mainList[k].curveobj;
			if(!obj.visible)
				continue;
			var col = [];
			tcurves.push(col);
			var descrip = mainList[k].fileobj.fileinfo.SubFolder + "_" + mainList[k].fileobj.filename
			col.push(descrip + "(" + ylabel + ")");				
			for(var t=0; t<obj.ydata.length; t++)
			{	
				col.push((obj.ydata[t]*yscaling).toString());
			}
		}
		for(var k in roiList)
		{
			var obj = roiList[k].curveobj;
			if(!obj.visible)
				continue;
			var col = [];
			tcurves.push(col);
			//var descrip = roiList[k].fileobj.fileinfo.SubFolder + "_" + roiList[k].fileobj.filename
			var descrip = "" + roiList[k].fileobj.filename  + "_OVER_" + masterimage.fileobj.fileinfo.SubFolder + "_" + masterimage.fileobj.filename	
			col.push(descrip);				
			for(var t=0; t<obj.ydata.length; t++)
			{	
				col.push((obj.ydata[t]*yscaling).toString());
			}
		}

	var str = "";
	for(var t=0; t<coltp.length; t++)
	{
		for(var k=0; k<tcurves.length; k++)
		{
			if(t < tcurves[k].length)
				var val = tcurves[k][t];
			else
				var val = "";
			str += val + "\t";
		}
		str += "\n";
	}

	
	var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+str+"</textarea>").appendTo($body).select();
	var successful = document.execCommand('Copy');
	$.notify(" Copied "+  (tcurves.length-1) + " visible timeseries copied to clipboard","success");
	$temp.remove();
	console.log(str);


	}


	/******************************************************************************
	updateCurrentTimePoint
	*******************************************************************************/
	that.updateCurrentTimePoint = function(val)
	{
		if (state.mode != "histogram")
		{
			$currenttimeline.attr('x1', val/maxnumtimepoints*100);
			$currenttimeline.attr('x2', val/maxnumtimepoints*100);
		}
		else
		{
			updateCurveData_rois();
			drawAllCurves();	
		}
	}

	/******************************************************************************
	drawcurve
	*******************************************************************************/
    function drawcurve(curveindex, obj,lims)
    {
		/* 
		MODES  
			Normal
			VSI
			Diffusion
			Perf neg logplot
		
		SWITCHTES
			baselinelength subtraction
			Scale to min / max of all curves
			Logplot
			Minus

    	*/
    	
		var $curve = $($curves.get(curveindex));

		if(!obj.visible)
		{
			$curve.css('visibility','hidden');
			return;
		}

        var pstr = "";
		var color =  obj.color==undefined?curveindex:obj.color;
		color = KColor.list[color];

		//********* baselinelength
		if(state.baselinelength > 0)
		{
			var m = 0;
			var blength = state.baselinelength<obj.ydata.length?state.baselinelength:obj.ydata.length;
			for (var k = 0; k < blength; k++)
			{
				m += obj.ydata[k];
			}
			m = m/state.baselinelength; 
		}
		else
		{
			m = 0;
		}

		var yscaling = parseFloatEval(state.yscaling,seqinfo);
		if (isNaN(yscaling))
			yscaling = 1;

		var vx = 0;
		var vy = 0;
		var max;
		var min;
		var ysum = 0;
		var n = obj.ydata.length;

		for (var i = 0; i < obj.ydata.length; i++)
		{

			if(state.baselinelength > 0)
				vy = (obj.ydata[i] - m ) ;
			else
				vy	= obj.ydata[i] ;

			if ( isNaN(vy) )
				vy = 0;
			
			vy *= yscaling;

			if(state.mode == 'tseries' | state.mode == 'dce_test')
			{
				vx = ( i / (obj.ydata.length));
			}
			else if(state.mode == 'vsi')
			{
				vx = (obj.xdata[i]/1000);
			}
			else if (state.mode == 'histogram')
			{
				vx = (obj.xdata[i]- lims[0]) /(lims[1] - lims[0]);
			}

		
			if (max == undefined | vy > max)
				max = vy;
			if (min == undefined | vy < min)
				min = vy;

				// vsi speciality, remove first points
				if(state.mode == 'vsi' && i < 4)
				{
					vx = 0;
					vy = 0;
				}
			
			ysum += (vy/n);
			pstr += vx + ",";
			pstr += (vy) + " ";

		}


		// if baseline corrected, must take min is already 0
		if(state.baselinelength > 0)
		{			
			//max = max -min;
			//min = 0;
		}

		if(max == min)	
			max = min + 0.00000001;

			
        if(state.normalise == 'noscaling')
		{
			$curve.attr('transform'," scale(1,1 ) translate(0,0) ");
		
		}
		else
		{
			if(state.normalise == 'individual_max')
				var yscale = 1/(max - min);
			else if(state.normalise == 'individual_area')
				var yscale = 1/(ysum)/5;
			else if(state.normalise == 'individual_lastpoint')
				var yscale = 1/vy/5; // last point


			var yshift = -min

			if(isNaN(yscale))
				yscale = 1;
			if(isNaN(yshift))
				yshift = 0;
			xscale = 1;

// 			if(state.mode == 'vsi')
// 				xscale = 1/max/5;

			$curve.attr('transform'," scale("+xscale+", " + yscale + ") translate(0, "+ yshift + ") ");
			obj.ymax	= 1;
			obj.ymin	= 0;
			
		}

        $curve.attr("points", pstr);
        $curve.css("stroke", 'rgb('+ color.join(',') +')');
        $curve.css('stroke-width','' + obj.linewidth);
        $curve.css('stroke-dasharray', obj.dasharray);
        $curve.css('visibility','visible');


        
    }
    that.drawcurve = drawcurve;
    


	/******************************************************************************
	extract the curve data from nii / roi
	*******************************************************************************/
	function calcCurveData(curveobj, niiOriginal, roiobj,callback)
	{

		
		if(niiOriginal == undefined)
		{
			curveobj.xdata = [];
			curveobj.ydata = [];
		}

		// either a single point, or mean over a roi
		var sizeroi;
		var point_vox = [];

		if(roiobj == undefined)
		{
			var point  = KViewer.currentPoint;	
			// in non-global coordinate mode, points can be different ...
			if( KViewer.globalCoordinates == false )
			{
				KViewer.iterateMedViewers(function(m)
            	{
					if (m.nii !=undefined &&  m.niiOriginal == niiOriginal)
					{
						point = m.getWorldPosition();
					}
				
    			});


			}

			point_vox.push( math.multiply(math.inv(niiOriginal.edges), point) );
			sizeroi = 0;
		}
		else
		{
			var roi = roiobj.content;
			if (roi == undefined)
				return;

			//var roi = roiobj.nii;
			sizeroi = roi.sizes[0] * roi.sizes[1] * roi.sizes[2];

			if (niiOriginal.edges._data.toString() == roi.edges._data.toString())
				var A = undefined;
			else
				var A = (math.multiply(math.inv(roi.edges), niiOriginal.edges))._data;

		}

		
		//if (master.mainViewport !== -1)
		//   point = math.multiply(math.inv(master.reorientationMatrix.matrix), point);

		var xdata = [];
		var ydata = [];
		var vsz = niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2];


		//updateProgress(1);
		//setTimeout(findVoxels, 0);
		findVoxels();


		


		//******* functions *******
		function updateProgress(perc)
		{
			if(roiobj!=undefined && curveobj.handles != undefined && curveobj.handles.$namediv != undefined)
			{
				if(perc > 0)
				{
					curveobj.handles.$namediv.css('background', 'red');
				}
				else
				{
					curveobj.handles.$namediv.css('background', '');
				}
			}
		}

		function findVoxels()
		{
			// this is a roi. Find all indices and sum up for each timepoint (below)
			if(sizeroi > 0 )
			{
				var sz = roi.sizes;
				if (roi.onVoxels == undefined)
				{
					roi.onVoxels = KViewer.roiTool.history.initOnVoxels(roi);
				}
				var keys = Object.keys(roi.onVoxels);
				// slicing of roi and contrast identical
				if (A == undefined)
				{
					for (var k = 0; k < keys.length;k++)
					{
						var idx = keys[k];
						if (roi.onVoxels[idx] == 1)
						{
							var x = idx%sz[0];
							var y = Math.floor(idx/sz[0])%sz[1];
							var z = Math.floor(idx/(sz[0]*sz[1]));
							point_vox.push( math.matrix([x,y,z])) ;
						}
					}

				}
				else // slicing of roi and contrast different
				{

					var maxx=0,maxy=0,maxz=0;
					var minx=niiOriginal.sizes[0],miny=niiOriginal.sizes[1],minz=niiOriginal.sizes[2];

					// find bbox
					var invA = math.inv(A)._data;
					for (var k = 0; k < keys.length;k++)
					{
						var idx = keys[k];
						if (roi.onVoxels[idx])
						{
							var x = idx%sz[0];
							var y = Math.floor(idx/sz[0])%sz[1];
							var z = Math.floor(idx/(sz[0]*sz[1]));
							var wx = invA[0][0]*x+invA[0][1]*y+invA[0][2]*z + invA[0][3];
							var wy = invA[1][0]*x+invA[1][1]*y+invA[1][2]*z + invA[1][3];
							var wz = invA[2][0]*x+invA[2][1]*y+invA[2][2]*z + invA[2][3];
							if (wx > maxx) maxx = wx;
							if (wy > maxy) maxy = wy;
							if (wz > maxz) maxz = wz;
							if (wx < minx) minx = wx;
							if (wy < miny) miny = wy;
							if (wz < minz) minz = wz;
						}
					}



					for (var pz = minz; pz < maxz; pz++)
					{
						for (var py = miny; py < maxy; py++)
						{
							for (var px = minx; px < maxx; px++)
							{
								var rv = trilinInterp(roi, px, py, pz, A, 0);
								if (rv > 0.5)
									point_vox.push( math.matrix([px,py,pz])  );
							}
						}
					}
				}
			}
			updateProgress(2);
				
			
			//setTimeout(calcSeries, 0);
			calcSeries();

			if (callback)
				callback();

		}

		function calcSeries()
		{


			updateProgress(2);

			var count = point_vox.length;

			if (state.mode == "histogram")			
			{
				var vals = [];			
				var min = 99999999;	
				var max = -99999999;	
				var m=0;
				var m2=0;
				var cnt = 0;
				for(var p=0; p < count; p++)
				{

					var pv = point_vox[p];
					var vv = NNInterp(niiOriginal, pv._data[0], pv._data[1], pv._data[2], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], niiOriginal.currentTimePoint.t*niiOriginal.sizes[0]*niiOriginal.sizes[1]*niiOriginal.sizes[2]);
					vv = niiOriginal.datascaling.e(vv);
					if( !isNaN(vv) && vv != undefined)
					{
						vals.push(vv);
						if (min > vv)
							min = vv;
						if (max < vv)
							max = vv;
					    m+=vv;
					    m2+=vv*vv;
					    cnt++;
					}
				}

				if (min==max)
					return;


//			    var nbins = 1000;
				// fine histo to compute quantiles
//				var histogram = comphisto(min, max, nbins, vals, vals.length, 500)

				var nbins = 30;

				var nsamps = vals.length;
				if (nsamps > 20000)
					nsamps = 20000;

			    var histogram = comphisto(min ,max, nbins, vals,  vals.length,  nsamps);


				curveobj.xdata = [];

				for ( var k = 0 ; k < nbins; k++)
					curveobj.xdata.push(k *(max-min)/nbins+min);

				curveobj.ymax = histogram.accus.maxfreq
				curveobj.mean = m/cnt;
				curveobj.stddev = Math.sqrt(m2/cnt-(m/cnt)*(m/cnt));
				curveobj.count = cnt;
				curveobj.ydata = histogram.accus;
			}
			else
			{


			    var ymax = -100000000;
			    var ymin = 100000000;
				var auc = 0;
				// run over timepoints
				for (var k = 0; k < niiOriginal.sizes[3]; k++)
					chunkStep();

				function chunkStep()
				{
					var v = 0;
					// run over roi points
					for(var p=0; p < count; p++)
					{
						var pv = point_vox[p];
						var vv = NNInterp(niiOriginal, pv._data[0], pv._data[1], pv._data[2], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], k * vsz);
						vv = niiOriginal.datascaling.e(vv);
						if( !isNaN(vv) && vv != undefined)
								v += vv;
					}
					v = v/count;
					ydata.push(v);
					xdata.push(k);
					if (v > ymax)
					    ymax = v;
					if (v < ymin)
					    ymin = v;
					auc += Math.abs(v);

				}

				curveobj.xdata	= xdata;
				curveobj.ydata	= ydata;
				curveobj.ymin = ymin;
				curveobj.ymax = ymax;
				curveobj.auc = auc;

			}


			updateProgress(0);
				

		}

	
	}



	/******************************************************************************
	signal handlers
	*******************************************************************************/
	var shandlers = {};
	/* 
		drawSlices: undefined,
		updateImage: undefined,
		positionChane: undefined
	*/

	function enable()
	{
	    // on pos change, only update single point curves
	    if(shandlers.posChange == undefined)
			shandlers.posChange   =  signalhandler.attach("positionChange", updateCurveData_main);
	    if(shandlers.drawSlices == undefined)
			shandlers.drawSlices  =  signalhandler.attach("drawSlices", 	updateCurveData_main);
	    if(shandlers.updateImage == undefined)
 			shandlers.updateImage =  signalhandler.attach("updateImage", 	updateCurveData_rois );
	    if(shandlers.cacheManagerUpdate == undefined)
 			shandlers.cacheManagerUpdate =  signalhandler.attach("cacheManagerUpdate",  updateCurveList_main );
	    if(shandlers.roiListUpdate == undefined)
 			shandlers.roiListUpdate =  signalhandler.attach("roiListUpdate",  updateCurveList_rois );
	    
	    $curvecontainer.appendTo( $target ) ;

	}
	
	function disable()
	{
		signalhandler.detachByIdList( [shandlers.posChange, shandlers.drawSlices, shandlers.updateImage,shandlers.cacheManagerUpdate,shandlers.roiListUpdate]);
		shandlers = {};
	    //$curvecontainer.detach();
	}

	function close()
	{
		disable();
		that.$container.remove();
	}

	



	// initial run on tool creation

	updateCurveList_main();
	updateCurveList_rois();
	setMaster();


	updateCurveData_main();
	updateCurveData_rois();

	enable();


	setstate('normalise', 'noscaling')
	setstate('baselinelength', 'off')
	setstate('mode', 'tseries')

//	that.customToggle = close;
	return that;


	function parseFloatEval(str,i)
	{
				
		if (str == undefined)
			return NaN;
		try {	
			var s = str.split(" ");
	    	s = s[0].replace(/\$/g,"i.");
			var x = eval(s);
			return x;
		}
		catch(err)
		{
			return NaN
		}
	}

}