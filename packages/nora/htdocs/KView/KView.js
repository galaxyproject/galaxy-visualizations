

// ======================================================================================
// ======================================================================================
// ============= KView
// ======================================================================================
// ======================================================================================

var myeps = 0.00000001;
var runningID = 0;
function KView($parentContainer)
{
 /**  @class 
   *  The main KViewer object
   *  @alias KView   */
  var that = new Object();
  KViewer = that;

  if ($parentContainer == undefined)
  {
	  $parentContainer = $('#myKView').css('overflow', 'none');
	  that.standalone = false;
  }
  else 		
  	  that.standalone = true;

  var $container = $("<div id='KView_mainFrame'></div>").appendTo($parentContainer);
  var $toolbarCell    = $("<div class='KView_DIVCell'></div>").appendTo($container);
  var $viewportCell   = $("<div class='KView_DIVCell' style='width:100%'></div>").appendTo($container);
  var $spinner  = $("<div id='KView_mainSpinner' class='KViewPort_spinner' ><i class='fa fa-spinner fa-spin'></i> <span >Loading</span></div>").appendTo($container);


  that.progressSpinner = theSpinner($spinner);
  that.$container = $container;
  that.$parentContainer = $parentContainer;
  that.setReorientationMatrix = setReorientationMatrix;
  that.reorientationMenu = reorientationMenu;
  that.reorientationMatrix = {notID:false, matrix: math.matrix(math.diag([1,1,1,1])), name: ""};


  var controlsOn = true;
  that.hasControlsOn = function() {return controlsOn};
  that.navigationMode = 2;


	
  //markerPanel = that.markerPanel = KMarkerPanel();


  that.dataManager = KDataManager();


  ///  ---------- The viewport container
  var $viewportContainer   = $("<div id='KView_viewportContainer'></div>").appendTo($viewportCell);
  that.$viewportContainer = $viewportContainer;
  

  ///  ---------- The left toolbar
  var $toolbarContainer    = $("<div id='KView_toolBarLeft'></div>").appendTo($toolbarCell);
  that.$toolbarContainer = $toolbarContainer;

  if(!KViewer.standalone)
  	var $leftresizer = $("<div id='patient_table_resizer' class='resizer_vertical'><div><div></div></div></div>").appendTo($container).mousedown(resizeViewer);

  that.mainViewport = -1;

  that.zoomLims = [];

  that.defaults = { overlay:{}, ROI:{} };

  that.globalScrollSpeed = 1;

  // ======================================================================================
  // Layout selector
  // ======================================================================================   
  /** the layout matrix for selection of viewport layout
   * @inner */
  var $layoutParent = $("<div class='KView_tool_menu_layoutSelectorParent'></div>")
  var $vertport =  $("<div class='vertport' ></div>").appendTo($layoutParent).click(function()
  {
  	  if (ViewerSettings.nVisibleVertports > 0) ViewerSettings.nVisibleVertports = 0;
  	  else ViewerSettings.nVisibleVertports = 1;
	  layoutMatrix_update();
	  setViewPortLayout(); 
	     			

  }	);
  var $layoutMatrix =  $("<table class='KView_tool_menu_layoutSelectorTable'></table>").appendTo($layoutParent).mouseleave(layoutMatrixLeave)



    
  for (var k = 0; k < 3; k++)
  {
  	  var $tr =  $("<tr></tr>").appendTo($layoutMatrix);  	
	  for (var j = 0; j < 4; j++)
	     $tr.append( $("<td myrow="+(k+1)+" mycol="+(j+1)+"></td>").click(function(l){ return function()
	     		{
	     			
	     			setViewPortLayout(l); 
	     			setViewPortLayout();
	     			signalhandler.send('positionChange'); 
	     			 layoutMatrix_update();
	     		} }([k+1,j+1]) ).mouseenter(layoutMatrixEnter) )
	 	 
  }
  var $bars = [];
  for (var k = 0; k < 3; k++)
  {
    $bars[k] =  $("<tr><td colspan='4'></td></tr>").appendTo($layoutMatrix).mouseenter(layoutMatrixEnter).click(
	  function(k) { return function()
	  {
	  	  if ($bars[k].hasClass('KView_tool_menu_layoutSelectorTable_active'))
		  	 ViewerSettings.nVisibleBarports--;
		  else
		     ViewerSettings.nVisibleBarports++;
		  setViewPortLayout(); 
		  signalhandler.send('positionChange'); 
		  layoutMatrix_update();
	  } }(k) );
  }

  var $addfloat = $("<i class='fa fa-plus fa-1x'></i>")
 
  var floating_viewports = {};

  $layoutParent.append($("<div class='floatports'> floating </div>").append($addfloat))

  $addfloat.click(function() {
 	var panelview = KPanelView(KViewer,"",{showElements:true,addClass:"floatingViewporthidetitle"});

	
  });
  
  function layoutMatrix_update()
  {
  		$vertport.removeClass('KView_tool_menu_layoutSelectorTable_active');
		  $layoutMatrix.find('td').removeClass('KView_tool_menu_layoutSelectorTable_active')
	      $layoutMatrix.find('td').each( function(k, e){ a = $(e);
	  	  if( a.attr('myrow') <= ViewerSettings.nVisibleRows  & a.attr('mycol') <= ViewerSettings.nVisibleCols)
	  	    	$(a).addClass( 'KView_tool_menu_layoutSelectorTable_active' );	     });

		  $.each($bars,function(k,e) { 
		  	$(e).removeClass('KView_tool_menu_layoutSelectorTable_active');
			if (k < ViewerSettings.nVisibleBarports )
				$(e).addClass('KView_tool_menu_layoutSelectorTable_active');
		  } )	  	  

		  if (ViewerSettings.nVisibleVertports > 0)
		  	$vertport.addClass('KView_tool_menu_layoutSelectorTable_active');

  }

  function layoutMatrixEnter()
  {
	  var myrow = $(this).attr('myrow');
	  var mycol = $(this).attr('mycol');
	  $layoutMatrix.find('td').removeClass('KView_tool_menu_layoutSelectorTable_td_hovered')
	  if (myrow == undefined)
  	      return;
  	  else
		  $layoutMatrix.find('td').each( function(k, e){ a = $(e);	      
			  if( a.attr('myrow') <= myrow  & a.attr('mycol') <= mycol)
				 $(a).addClass( 'KView_tool_menu_layoutSelectorTable_td_hovered' );
		  });
  }
  
  function layoutMatrixLeave()
  {
	  $layoutMatrix.find('td').removeClass('KView_tool_menu_layoutSelectorTable_td_hovered')
  }

  // ======================================================================================
  // KView tools bar
  // ======================================================================================


  var $closeAll =  $("<div class='KView_tool KView_tool_enabled'><i class='fa fa-close fa-1x'></i></div>").appendTo($toolbarContainer)
                          .click(function() { closeAll(); })
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Close all</li>") ));


  var $layoutSelector   = $("<div data-tooltip='change the number of viewports' class='KView_tool'><i  class='fa fa-th-large fa-1x'></i></div>")
						   .click(function() { 
						   			setViewPortLayout([ViewerSettings.nVisibleRows,ViewerSettings.nVisibleCols]);  
					     			setViewPortLayout();
						   			}) 
  						   .appendTo($toolbarContainer)
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Layout Selector </li>") )
                         .append($layoutParent)                          
                        );
  that.$layoutSelector = $layoutSelector;
  $layoutSelector.mouseenter(function() { layoutMatrix_update(); });



  var $fullscreenToggle =   $('#fullscreentoggle');
  $fullscreenToggle.click(function()
  {
        var icon = this.children[0];
        if (isFullScreen())
        {
            $(icon).addClass("fa-expand"); $(icon).removeClass("fa-compress");
            exitFullScreen();
        }
        else
        {
            $(icon).removeClass("fa-expand"); $(icon).addClass("fa-compress");
            requestFullScreen(document.documentElement);
        }
  } )


  function toggleControls(e)
  {
	   if ($('.KViewPort_container').hasClass('noBorder'))
	   {
			//$controlstext.text("Turn off controls")
	   }
	   else                           	      		
	   {
		    //$controlstext.text("Turn on controls")
	   }
       $controlsToggle.toggleClass('KView_tool_enabled');	   
	   toggleElementsForScreenShot();
  }  
  
  var $histoToggle =    $("<div class='KView_tool KView_tool_enabled'><i class='fa fa-area-chart fa-1x'></i></div>").appendTo($toolbarContainer)
                          .click(toggleHistogram)
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Histograms</li>") )
                              );

  var $crossHairToggle =  $("<div class='KView_tool KView_tool_enabled'><i class='fa fa-crosshairs fa-1x'></i></div>").appendTo($toolbarContainer)
                          .click(toggleCrossHair)
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Crosshair</li>") ));

  var $infobarToggle =  $("<div class='KView_tool KView_tool_enabled'><i class='fa fa-info-circle fa-1x'></i></div>").appendTo($toolbarContainer)
                          .click(toggleInfobar)
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Infobar</li>") ));

  var $controlsToggle =  $("<div class='KView_tool KView_tool_enabled'><i class='fa fa-th-list fa-1x'></i></div>").appendTo($toolbarContainer)
                          .click(toggleControls)
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Toggle Image Controls</li>") ));

  var $pixelated =  $("<div  style='margin-bottom:20px'  class='KView_tool '><i class='fa fa-th fa-1x'></i></div>").appendTo($toolbarContainer)                          
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>pixelated</li>"))).click( function(e) {
                                  if (ViewerSettings.pixelated)
                                  {
                                        ViewerSettings.pixelated = false;
                                        $pixelated.removeClass("KView_tool_enabled");
                                    //  $(e.target).text("pixelated")
                                      $('.KViewPort_canvas').removeClass('KViewPort_canvas_pixelated');   
                                  }
                                  else
                                  {                 
                                        $pixelated.addClass("KView_tool_enabled");
                                        ViewerSettings.pixelated = true;          	      		
                                                //      $(e.target).text("interpolated")
                                                      $('.KViewPort_canvas').addClass('KViewPort_canvas_pixelated');   
                                  }
                                    }
                                    ) ;
                          
/*
  var $pixelated,$controlstext;

  var $toolviewSettings =  $("<div class='KView_tool '><i  class='fa fa-bars fa-1x'></i></div>").appendTo($toolbarContainer)
                           .append( $("<ul class='KView_tool_menu'></ul>")
                           .append($("<li>Settings</li>") )
                           .append($pixelated = $("<li>Not pixelated</li>")
                                .click( function(e) {
                                  if (ViewerSettings.pixelated)
                                  {
                                        ViewerSettings.pixelated = false;
                                      $(e.target).text("pixelated")
                                      $('.KViewPort_canvas').removeClass('KViewPort_canvas_pixelated');   
                                  }
                                  else
                                  {                 
                                        ViewerSettings.pixelated = true;          	      		
                                                      $(e.target).text("interpolated")
                                                      $('.KViewPort_canvas').addClass('KViewPort_canvas_pixelated');   
                                  }
                                    }
                                    ) )
                           .append($controlstext = $("<li>Turn off controls</li>").click( toggleControls) )
                           .append($("<li>Screenshot</li>").click( function(e) {
                               	takeScreenshot(e);
	 							                }      ) )   ); */
    KViewer.$pixelated = $pixelated;


  // ======================================================================================
  // Dedicated Annotation Marker Menu
  // ======================================================================================
    var $annotationMenu =  $("<div  class='KView_tool '><i  class='fa fa-adn fa-1x'></i></div>").appendTo($toolbarContainer)
    var $annotationMenuUL = $("<ul class='KView_tool_menu'></ul>").appendTo($annotationMenu).append($("<li>Annotation Panels</li>"))

	if (typeof KMarkerTool != "undefined")
	{	
		//var $ttt = KToolWindow.$thetoggle.find(".KView_tool_menu")
		var $ttt = $annotationMenuUL;

		$("<li>Boxes</li>").click(function(){ KMarkerPanel_boxes(); }).appendTo($ttt);
		$("<li>Circles</li>").click(function(){ KMarkerPanel_circles(); }).appendTo($ttt);
		$("<li>2DRuler</li>").click(function(){ KMarkerPanel_2Drulers(); }).appendTo($ttt);
		$("<li>3DRuler</li>").click(function(){ KMarkerPanel_3Drulers(); }).appendTo($ttt);
		$("<li>Scribble</li>").click(function(){ KMarkerPanel_scribble(); }).appendTo($ttt);
		$("<li>RenalStones</li>").click(function(){ KPointRoiTool(); }).appendTo($ttt);
		$("<li style='border-top:1px solid gray'>Configurator ...</li>").click(function(){ KMarkerPanel_configurator(); }).appendTo($ttt);

	}


    
  // ======================================================================================
  // Global coords and other buttons
  // ======================================================================================
   var $crossHairReset =  $("<div  class='KView_tool '><i  class='fa fa-reply fa-1x'></i></div>").appendTo($toolbarContainer)
                           .click(resetCrossHair)
                           .append($crossHairReset_ul= $("<ul class='KView_tool_menu'></ul>")
                           .append($("<li>View</li>"))
                           .append($("<li>Reset view <i class='fa fa-reply fa-1x'></i></li>").click(resetCrossHair) )
                           .append($("<li>Center at haircross<i class='fa fa-crosshairs fa-1x'></i></li>").click(function(e){
                           		e.stopPropagation();
                           		e.preventDefault();
								signalhandler.send("centralize");  }))		
						   .append($("<li>Global coordinates<i class='toggleGlobalCoordinates fa fa-check fa-1x'></i></li>").click(toggleGlobalCoordinates) )								                           
                           );

    if (typeof presetForm_viewer_permorder != "undefined")
    {
        var $Csystem =  $("<div  class='KView_tool '><i  class='fa fa-globe fa-1x'></i></div>").appendTo($toolbarContainer)
        var $Csystem_ul =  $("<ul class='KView_tool_menu'></ul>").appendTo($Csystem)
		$Csystem_ul.append($("<li>Coordinate System</li>"))
		var l = presetForm_viewer_permorder.choices;
		for (var k=0;k < l.length;k++)
		{
			var check = "";
			if (presetForm_viewer_permorder.ids[k] == state.viewer.permOrder)
				check = "fa-check"
			$Csystem_ul.append($("<li id="+presetForm_viewer_permorder.ids[k]+">"+ l[k]+  "<i class='fa "+check+" fa-1x'></i></li>").click(function()
			{
				$(this).parent().find("i").removeClass("fa-check")
				$(this).children().addClass("fa-check")
				var id = $(this).attr("id")
				state.viewer.permOrder = id

        		var tlist = KViewer.dataManager.getFileList();
        		for (var j in tlist)
        		{
        			var f = KViewer.dataManager.getFile(tlist[j])
        			if (f && f.content && f.content.applyReordering)
        			{
						f.content.applyReordering(id);
						signalhandler.send("updateImage",{id:f.fileID});
        			}
        		}

			}))

		}
    }

//	if (typeof html2canvas != "undefined")
      var $screenShot =  $("<div class='KView_tool '><i class='fa fa-camera fa-1x'></i></div>").appendTo($toolbarContainer)                          
                          .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Screenshot</li>")
                           ).append($("<li>Still PNG</li>").click(takeScreenshot)).append($("<li>Animated GIF</li>").click(createGif.createPanel)));

    {                            
		var $saveprojectstate =  $("<div  class='KView_tool '><i  class='fa fa-save fa-1x'></i></div>").appendTo($toolbarContainer)

						.append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Save working state</li>")) )

								.click(function() { saveWorkstate(that) });

		if (typeof ajaxRequest != "undefined")
			var $refreshFiles =  $("<div  class='KView_tool '><i  class='fa fa-refresh fa-1x'></i></div>").appendTo($toolbarContainer)
							.append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Refresh files</li>")) )
							.click(function()
							{
								KViewer.dataManager.refetchAllFiles();
							});

    }
    that.$screenShot = $screenShot;
    var $globalCoordinatesToggle = $crossHairReset.find('.toggleGlobalCoordinates');

    if (!electron && application != "webview")
	{
		var $Batch =  $("<div class='KView_tool'><i class='fa fa-cogs fa-1x'></i></div>").appendTo($toolbarContainer)
		  .click(function() {
			  var icon = this;
			  commandDialog.toggle();
			  //if (commandDialog.toggle())
			  //	$(icon).toggleClass("KView_tool_enabled");
		   })
		  .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Batchtool</li>") ));
	}

    // ======================================================================================
    //  Autoloader
    // ======================================================================================

	var $autoLoaderMenu =  $("<div id='autoloaderButtonDIV' style='margin-bottom:10px;' class='KView_tool KView_tool_enabled_green '><i  class='fa fa-car fa-1x'></i></div>")
	
	// appending to top menu does not work so simply, this one is refreshed on project change ...
// 	var $target = $("<li>ddddd</li>");
// 	$target.appendTo( $('#patientTableTopTools').find("ul") );
//	$autoLoaderMenu.appendTo($target);
	//$autoLoaderMenu.appendTo($toolbarContainer);

	$autoLoaderMenu.insertAfter($closeAll);
/*
	var $dummy =  $("<div id='autoloaderButtonDIV' style='margin-bottom:20px' class='KView_tool'><i  class='fa fa-car fa-1x'></i></div>")
		.append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Item went to top of menubar! </li>")))
        .appendTo($toolbarContainer)
        .click(function(){alert('Item went to top of menubar, use that new button!')})
*/
	that.$autoLoaderMenu = $autoLoaderMenu;
	$autoLoaderMenu .click(function(ev) {autoloader_toggle()})
	   
	function autoloader_toggle(what)
	{
		if(what !== undefined)
			state.viewer.enableAutoloaders = what;
		else
			state.viewer.enableAutoloaders = state.viewer.enableAutoloaders===true?false:true; 

		if(state.viewer.enableAutoloaders)
		{
			$autoLoaderMenu.addClass('KView_tool_enabled_green');
			$autoLoaderMenu.find('.atoggler').addClass('fa-check'); 
		
		}
		else
		{
			$autoLoaderMenu.removeClass('KView_tool_enabled_green');
			$autoLoaderMenu.find('li').eq(0).find('i').css('color', 'initial');
			$autoLoaderMenu.find('.atoggler').removeClass('fa-check'); 
		}
	}


	var autoLoaderLiveEdit_show = false;
	function autoLoaderLiveEdit_toggle(what)
	{
		if(what !== undefined)
			autoLoaderLiveEdit_show = what;
		else
			autoLoaderLiveEdit_show = autoLoaderLiveEdit_show?false:true;
		autoLoaderLiveEdit_update();
	}



	function autoLoaderLiveEdit_update()
	{
		$(document).off('blur', '.KViewPort_autoLoaderLiveEdit');
		
		$container.find('.KViewPort_autoLoaderLiveEdit').remove();
		if(!autoLoaderLiveEdit_show)
			return;
	
		for(var k=0;k<state.viewer.autoloaders.length; k++)
		{
			var a = state.viewer.autoloaders[k];
			var ids  = a.viewportID.toString().split(",");
			ids.forEach(function(part,index,array) { array[index] = parseInt(part); });


			for(var i =0; i<ids.length; i++)
			{
				var $loadEdit = viewports[ids[i]].$container.find('.KViewPort_autoLoaderLiveEdit')
				if($loadEdit.length == 0)
				{

					var $loadEdit = $("<div class='KViewPort_autoLoaderLiveEdit'></div>").appendTo(viewports[ids[i]].$container);
					$loadEdit.append($("<span class='loadEdit_close'><i class='fa fa-close'></i></span>").click(function(){autoLoaderLiveEdit_toggle(false) }) );
					$loadEdit.append($("<div class='loadEdit_background'> Background</div>"));
					$loadEdit.append($("<div class='loadEdit_rois'>Rois</div>"));
					$loadEdit.append($("<div class='loadEdit_overlays'> Overlays</div>"));
				}

				var form = {name:"temp", layout: 		[ {name:"pattern"	    	, type: 'textarea',     defaultval:"FFilename:"  , class:"autoloaderitem"  }	]};

				if(a.intent.overlay)
					var $form  = KForm.createForm(form, state.viewer.autoloaders[k] , $loadEdit.find('.loadEdit_overlays') );
				else if(a.intent.roi)
					var $form  = KForm.createForm(form, state.viewer.autoloaders[k] , $loadEdit.find('.loadEdit_rois') );
				else
					var $form  = KForm.createForm(form, state.viewer.autoloaders[k] , $loadEdit.find('.loadEdit_background') );

				// remove the labels from the forms
				$loadEdit.find('label').remove();

			}

		}

		if(state.viewer.autoloaders.length == 0)
		{
			var $loadEdit = $("<div style = 'width:220px' class='KViewPort_autoLoaderLiveEdit'></div>").appendTo(viewports[0].$container);
			$loadEdit.append($("<div class='loadEdit_background'>No images found for autoload!</div>"));
			$loadEdit.append($("<span class='loadEdit_close'><i class='fa fa-close'></i></span>").click(function(){autoLoaderLiveEdit_toggle(false) }) );
		}
		//$(document).on('blur', '.KViewPort_autoLoaderLiveEdit',autoLoaderLiveEdit_update )
	}
	that.autoLoaderLiveEdit_toggle = autoLoaderLiveEdit_toggle;
	that.autoLoaderLiveEdit_update = autoLoaderLiveEdit_update;
	that.autoloader_toggle = autoloader_toggle;
	
	
 
    if (KViewer.standalone || electron || application == "webview")

	{
		$autoLoaderMenu.hide();						  						   
		//$screenShot.hide();
		if (typeof $markerToggle != "undefined")
			$markerToggle.hide();
	}





  // ======================================================================================
  // viewports creation
  // ======================================================================================

  var nRows = 3;
  var nCols = 5;
  var vpAssignment = [ [0,1,4,5],[2,3,6,7 ],[8,9,10,11]];

  var nViewports = nRows*nCols ;
  var nVisibleViewports = 1;
  that.nVisibleViewports = nVisibleViewports;

  /** the viewport grid
   * @inner */
  var viewports = new Array();
  that.viewports = viewports;


  for(var k=0;k<2;k++)
  {  	
    viewports[k+20] = new KViewPort(that, k+20);
    viewports[k+20].$container.hide();	
    viewports[k+20].vertport = true;
    viewports[k+20].right_neighbor = 'cartridge';
    viewports[k+20].width_in_perc = state.viewer.vertportSizePercent;
  }


  for(var k=0;k<nViewports;k++)
    viewports[k] = new KViewPort(that, k);
  for(var k=0;k<3;k++)
  {  	
    viewports[k+nViewports] = new KViewPort(that, k+nViewports);
    viewports[k+nViewports].$container.hide();	
    viewports[k+nViewports].barport = true;
  }


  for (var k = 0; k < 3; k++)
  {
	  for (var j = 0; j < 3; j++)
	  {
	  	  viewports[vpAssignment[k][j]].left_neighbor = vpAssignment[k][j-1];
	  	  viewports[vpAssignment[k][j]].right_neighbor = vpAssignment[k][j+1];
	  }  	
  }


  
  var $dummyPortContainer = $("<div> </div>");
  that.$dummyPortContainer = $dummyPortContainer;

  var $zoomedPortContainer   = $("<div class='KViewPort_zoomedPort'></div>").appendTo($viewportContainer);
  $zoomedPortContainer.on("dragover",  function(ev)
	  {
		ev.preventDefault(); 
		return false;
	  });
  that.$zoomedPortContainer = $zoomedPortContainer;
  that.zoomedViewport = -1;
  that.zoomPanMode = true;

  that.unZoomViewport = function()
  {
  	if (KViewer.zoomedViewport != -1)
  		KViewer.viewports[KViewer.zoomedViewport].zoomViewPort();
  }

  that.setSizeLeftViewportCol = function(t)
	{
		  var tools = KToolWindow.findToolInLowerContainer();
		  var avail_height =  that.$zoomedPortContainer.height();

			var tools = KToolWindow.findToolInLowerContainer();

			var hs = [];
			var toth = 0;
			for (var k = 0; k < tools.length;k++)
			{
				var h = tools[k].$container.height();;
				toth += h;
				hs.push(h);
			}

			if (t == undefined)
				t = toth;

			for (var k = 0; k < tools.length;k++)
				tools[k].resize(hs[k]/toth*t);

			$("#patientThumbContainer").height(avail_height-t);

	}


  /** run over all present medviewers
   * @function */
  that.iterateMedViewers = function(callback)
  {
  	var keys = Object.keys(viewports);
    for(var k = 0; k < keys.length; k++)
      if (viewports[keys[k]].medViewer != undefined && !viewports[keys[k]].medViewer.dummyViewer)
      {	
      	// introduces that only iterate if the medviewer has an nifti inside. Otherwise follow errors
      	// maybe something might not work / will not be plotted...?
      	if(viewports[keys[k]].medViewer.nii !=undefined  )
          	callback( viewports[keys[k]].medViewer);
      }
  }


  that.findMedViewer = function(condition)
  {
	if (condition == undefined)
		condition = function() {return true};

  	var keys = Object.keys(viewports);
  	keys = [20].concat(keys);
    for(var k = 0; k < keys.length; k++)
      if (viewports[keys[k]].medViewer != undefined && !viewports[keys[k]].medViewer.dummyViewer)      
      {	
      	if (condition(viewports[keys[k]].medViewer))
      		return viewports[keys[k]].medViewer;
      }

  }



  // ======================================================================================
  // Geometry and  master/interpolation mode
  // ======================================================================================

  /** the current postion in world coords 
   * @inner */
  that.currentPoint  = math.matrix([0,0,0,1]);
  that.currentPoint.reset = true;
  
  /** the current time point as global parameter
   * @inner */
  that.movie = 
  {
		currentTimePoint:0,
		isPlayed:false,
		maxNumTimePoints:0,
		timerId:0  	
  }

  /** the center of image matrix of last loaded image
   * @inner */
  that.viewcenter = math.matrix([0,0,0,1]);
  /**  tilt angles of slices
   * @inner */
  that.curTilts = new Array();
  that.curTilts[0]=[{v:0},{v:0}];
  that.curTilts[1]=[{v:0},{v:0}];
  that.curTilts[2]=[{v:0},{v:0}];
  that.currentTilts = function(z) { return function(i,j)
  {
    if (z.mainViewport != -1)
    {
        var nii = viewports[that.mainViewport].medViewer.nii;
        
        if(nii===undefined)
          return that.curTilts[i][j];
        var swapXY;
        if(i == 0) 
             swapXY = (nii.permutationOrder[1] >  nii.permutationOrder[2])?1:0;
        if(i == 1) 
            swapXY = (nii.permutationOrder[0] >  nii.permutationOrder[2])?1:0;
        if(i == 2) 
            swapXY  = (nii.permutationOrder[0] >  nii.permutationOrder[1])?1:0;
        var porder = nii.permutationOrder;
        if (swapXY)
          return z.curTilts[porder[i]][1-j];
        else
          return z.curTilts[porder[i]][j];
    }
    else
      return that.curTilts[i][j];
  } }(that);

  that.currentTilts_ = function(z) { return function(i,j)
  {
    return z.curTilts[i][j];
  } }(that);


  // reset view/position/tilts of all medviewers
  // @function 

  /** run over all present medviewers
   * @function */
  function resetCrossHair()
  {
     that.currentTilts(0,0).v = 0;
     that.currentTilts(0,1).v = 0;
     that.currentTilts(1,0).v = 0;
     that.currentTilts(1,1).v = 0;
     that.currentTilts(2,0).v = 0;
     that.currentTilts(2,1).v = 0;
     that.reorientationMatrix.matrix =  math.matrix(math.diag([1,1,1,1]));
     //that.currentPoint = math.multiply(that.reorientationMatrix.matrix, [0, 0, 0, 1]);
     that.currentPoint = math.multiply(that.reorientationMatrix.matrix, that.viewcenter);
     that.toggleMainViewport(-1);
    
     signalhandler.send("resetHaircrossTilts");
     signalhandler.send("setZoomLims",[1,0,0]);
     signalhandler.send("positionChange",{mosaicdraw:true});
     signalhandler.send("webglresetcam");
  }

  that.resetCrossHair =  resetCrossHair;

  that.toggleMainViewport = function(id, keep_enabled)
  {

	  if (id == -1) // turn off mainviewport in case, otherwise do nothing
	  {
		  if (that.mainViewport != -1)
			  that.toggleMainViewport( that.mainViewport  );    
		  return;
	  }
	  if(that.viewports[id] == undefined || that.viewports[id].medViewer == undefined)
		return;

	  var icon = that.viewports[id].medViewer.toolbar.$mainViewportSelector;

	  if(that.mainViewport == -1 ) // right now no master is selected. Enable this one.
	  {
		that.mainViewport = id;
		if (that.navigationTool)
			that.navigationTool.updateMasterCaption();
		icon.addClass('KViewPort_tool_enabled');
	  }
	  else   // already selected one. test if is itself or another
	  {
		if(that.mainViewport == id) // hit itself. switch off. But only if no keep_enabled was used (startup issues)
		{
		  if(keep_enabled == undefined)
		  {
			icon.removeClass('KViewPort_tool_enabled');
			that.mainViewport = -1;
			that.navigationTool.updateMasterCaption();			
		  }
		}
		else // anther one is master. switch this one off first.
		{
		  that.toggleMainViewport( that.mainViewport  );
		  that.mainViewport = id;
		  icon.addClass('KViewPort_tool_enabled');
		  that.navigationTool.updateMasterCaption();			
		}
	  }
	  signalhandler.send("reslice positionChange");

  }



  /** computes rotation matrix from tiltangle
   * @function */ 
  function getReorientationMatrixFromTiltAngles(sg,old_reorient,old_point)
   {
       if (old_point == undefined) 
   	     old_point = KViewer.currentPoint._data;
		   if (old_reorient == undefined) 
   	     old_reorient = that.reorientationMatrix.matrix;
   	     
       var xy = sg*Math.sin(-KViewer.currentTilts_(2,0).v/180*Math.PI);
       var xz = sg*Math.sin(-KViewer.currentTilts_(1,0).v/180*Math.PI);  // 1er + 0er flipped !!!!
       var xx = Math.sqrt(1- xy*xy - xz*xz);

       var yx = sg*Math.sin(KViewer.currentTilts_(2,1).v/180*Math.PI);
       var yz = sg*Math.sin(-KViewer.currentTilts_(0,0).v/180*Math.PI);
       var yy = Math.sqrt(1-yx*yx-yz*yz);

       var zy = sg*Math.sin(KViewer.currentTilts_(0,1).v/180*Math.PI);
       var zx = sg*Math.sin(KViewer.currentTilts_(1,1).v/180*Math.PI);
       var zz = Math.sqrt(1-zy*zy-zx*zx);

       R = math.transpose(math.matrix([ [xx,xy,xz,0], [yx,yy,yz,0],[zx,zy,zz,0],[0,0,0,1]]));

       var t = old_point;
       var Q = math.matrix([ [1,0,0,t[0]], [0,1,0,t[1]],[0,0,1,t[2]],[0,0,0,1]]);

       var s = math.multiply(math.inv(old_reorient), t);
       var T = math.matrix([ [1,0,0,s._data[0]], [0,1,0,s._data[1]],[0,0,1,s._data[2]],[0,0,0,1]]);

       var w = math.multiply((R), t);
       var Z = math.matrix([ [1,0,0,w._data[0]], [0,1,0,w._data[1]],[0,0,1,w._data[2]],[0,0,0,1]]);

       return {Q:Q,T:T,R:R,Z:Z,t:t,s:s};


  }
  that.getReorientationMatrixFromTiltAngles = getReorientationMatrixFromTiltAngles;

  /** sets reorientation matrix based from saved json
   * @inner */ 
  function setReorientationMatrix(ev)
  {
    that.reorientationMatrix.notID = true;
    var transform = JSON.parse(ev.content);
    that.reorientationMatrix.name = transform.name;
    that.reorientationMatrix.matrix = math.matrix(transform.matrix);
	KViewer.navigationTool.transform.update();
    signalhandler.send("reslice");    
  }

  function reorientationMenu()
  {

	   var $menu = $("<ul class='KView_tool_menu'>");
     $menu.append($("<li onchoice='flipx'>Flip X</li>"));
     $menu.append($("<li onchoice='flipy'>Flip Y</li>"));
     $menu.append($("<li onchoice='flipz'>Flip Z</li>"));
     $menu.append($("<li onchoice='cycle'>Cycle permute</li>"));
     $menu.append($("<li onchoice='pari'>Change Parity</li>"));
     $menu.append($("<li onchoice='reset'>Reset Transformation</li>"));
     $menu.append($("<li onchoice='save'>Save Transformation</li>"));

	   selFun = function() { return function(ev)
			   {
					ev.preventDefault();
			   		ev.stopPropagation();
					var str = $(ev.target).attr("onchoice");
					if (str=="reset")
                    {
                        KViewer.reorientationMatrix.matrix =  math.matrix(math.diag([1,1,1,1]));
                        KViewer.reorientationMatrix.notID = false;
                        signalhandler.send("reslice");
                        KViewer.resetCrossHair();

                    }
					else if (str=="save")
                    {
                        if (KViewer.reorientationMatrix.notID)
                        {
                          alertify.prompt("Please enter a name",function (e,name) {
                            if (e)
                            {
                                KViewer.reorientationMatrix.name = name;
								uploadJSON(name,{matrix: KViewer.reorientationMatrix.matrix._data},{subfolder: "transforms", tag:"RO"})
                            }
                          } );
                        }
                    }
					else
                    {	


  						  var mnii = KViewer.viewports[KViewer.mainViewport].medViewer.nii;
       					  var edges = math.multiply(1,mnii.edges);
						  edges = math.multiply(edges,permMat(mnii));



       					  var T = transMat(math.multiply(math.inv(edges),math.multiply(math.inv(KViewer.reorientationMatrix.matrix), KViewer.viewcenter)));
			 
					      var E = math.multiply(edges,T);
						
						  var R;
                          if (str == 'flipx')
                          	 R = math.diag([-1,1,1,1]);
                          if (str == 'flipy')
                          	 R = math.diag([1,-1,1,1]);
                          if (str == 'flipz')
                          	 R = math.diag([1,1,-1,1]);
                          if (str == 'cycle')
                          	 R = math.matrix([[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,0,1]]);
                          if (str == 'pari')
                          	 R = math.matrix([[0,0,1,0],[0,1,0,0],[1,0,0,0],[0,0,0,1]]);


						  KViewer.reorientationMatrix.matrix = math.multiply(KViewer.reorientationMatrix.matrix, math.inv(math.multiply(E,math.multiply(R,math.inv(E)))));

                          signalhandler.send("reslice");
                          signalhandler.send("positionChange");
                         // KViewer.resetCrossHair();
                    }
                    

					if (str != undefined | ev.type == "mousedown")
					{
						$(document.body).off("mouseup mousedown");
					}

			   }
	   }();


	   $menu.on("mousedown", selFun);

	   return $menu;



  }



  // ======================================================================================
  // viewer layout
  // ======================================================================================


  function setTableWidth(w)
  {
      var pt = $('#patientTableContainer');
      var $ptable = $('#patientTableWrap');
      var frame_width = $(document.body).width();
      if (w == "full")
      	w = frame_width;
      pt.width(w);
	  pt.children().width(w)
	  $ptable.width(w);
  	  setPatientTableLayout();
	  setViewPortLayout();
      signalhandler.send("patientTableWidthChanged");

  }
  KViewer.setTableWidth = setTableWidth;

  /** callback called on grabbing the vertical bar left to viewports
   * @inner */ 
  function resizeViewer(ev)
  {
    ev.preventDefault();
	  if (TableHidden)
		  toggleLeftBar();

    var x = ev.clientX;
    var pt = $('#patientTableContainer');
    var $ptable = $('#patientTableWrap');
    var w = pt.width();
    var frame_width = $(document.body).width();

    $ptable.css('overflow','hidden');
    $ptable.css('pointer-events','none');
    $("#KView_toolBarLeft").css('pointer-events','none');

    $(".haircrossFocus").hide();
 

    $(document.body).on("mouseup mouseleave",   mymouseup);
//    $(document.body).on("mousemove", moveUnlagger(mymousemove)) ;
    $(document.body).on("mousemove", mymousemove) ;
    
    function mymousemove(ev)
    {
		if (mymousemove_sub.fired != undefined)
		{
			clearTimeout(mymousemove_sub.fired)
		}
		mymousemove_sub.fired = setTimeout(function() {
			mymousemove_sub(ev);
			mymousemove_sub.fired = undefined;
		},0);
    }

    function mymousemove_sub(ev)
    {

		   var nx =  ev.clientX;
		   
		   var jumpPoint = 50;
		   var _w = w- (x - nx);

		   if (_w < jumpPoint & w > 0)
		   {
			   //$("#patientTableTopTools").hide();
				_w = 1;
			   $('.annotation_tool').css('overflow', 'hidden')
		   }
		   else
		   {
		   		$('.annotation_tool').css('overflow', 'initial')
		       //$("#patientTableTopTools").show();
		   }
		   
		   if (w-(x - nx) > 0.95*frame_width)
			  nx = frame_width-w+x-40;

		   if (_w < 1) 
		   	  _w = 1;
		   pt.width(_w);
		   pt.children().width(_w);
		   $ptable.width(_w);
		   setPatientTableLayout();
		   setViewPortLayout();
		   signalhandler.send("positionChange");
    	   signalhandler.send("patientTableWidthChanged"); 


           if (commandDialog && commandDialog.visible)
               commandDialog.fitIntoVP();

 
    }


    function mymouseup(ev)
    {
    	ViewerSettings.sizeTablePercent =  Math.round($ptable.width() / $(document.body).width() * 100);
    	
        $(document.body).off("mousemove mouseup mouseleave");
        setPatientTableLayout();
        setViewPortLayout();
        signalhandler.send("positionChange");
    	   signalhandler.send("patientTableWidthChanged"); 

        $ptable.css('overflow','auto');
        $ptable.css('pointer-events','all');
        $("#KView_toolBarLeft").css('pointer-events','all');
        
        ev.preventDefault();

        if (commandDialog && commandDialog.visible)
             commandDialog.fitIntoVP();


    }
  }

   



  $(window).resize(function(ev) {

       if (ev.target.toString() == "[object Window]" || ev.target.toString() == "[object global]")
       {

          setPatientTableLayout();
          setViewPortLayout();
          signalhandler.send("positionChange");
          if (commandDialog && commandDialog.visible)
             commandDialog.fitIntoVP();
          
       }
  });

  /** hides first all viewports and shows then only the visible ones
   * @inner */ 
  function reattachViewports()
  {
  	for (var k = 0; k < 22;k++)
  	{
  		if (viewports[k] != undefined)
  		{
			viewports[k].$container.hide();
			viewports[k].visible = false;
  		}
  	}

    nVisibleViewports = ViewerSettings.nVisibleRows*ViewerSettings.nVisibleCols;

    for (var k = 0; k < ViewerSettings.nVisibleVertports; k++)
    {
      viewports[20+k].$container.appendTo($viewportContainer);
      viewports[20+k].$container.css('position',"absolute");      
      viewports[20+k].$container.show();			
      viewports[20+k].visible = true;	
    }

    for(var k=0;k<nVisibleViewports;k++)
    {
      var ck = math.floor(k/ViewerSettings.nVisibleCols);
      var rk = k%ViewerSettings.nVisibleCols;
      viewports[vpAssignment[ck][rk]].$container.appendTo($viewportContainer);
      viewports[vpAssignment[ck][rk]].$container.show();			
      viewports[vpAssignment[ck][rk]].visible = true;			
    }
    for (var k = 0; k < ViewerSettings.nVisibleBarports; k++)
    {
      viewports[15+k].$container.appendTo($viewportContainer);
      viewports[15+k].$container.show();			
      viewports[15+k].visible = true;	
    }

   

  }

  /** layouts widths and heights of viewports
   * @inner */ 
  that.setViewPortLayout = setViewPortLayout;
  function setViewPortLayout(m)
  {
  	
    if(typeof(m)!=='undefined')
    {    
    	ViewerSettings.nVisibleRows = m[0];
    	ViewerSettings.nVisibleCols = m[1];

		for(var k=0;k<ViewerSettings.nVisibleRows*ViewerSettings.nVisibleCols;k++)
		{
		  var ck = math.floor(k/ViewerSettings.nVisibleCols);
		  var rk = k%ViewerSettings.nVisibleCols;
		  viewports[vpAssignment[ck][rk]].width_in_perc = Math.round(100/ViewerSettings.nVisibleCols);
		}

    }


    if (KViewer.zoomedViewport == -1) 
		reattachViewports();
		
    nVisibleViewports = ViewerSettings.nVisibleRows*ViewerSettings.nVisibleCols;

    var nVisibleBarports = ViewerSettings.nVisibleBarports;
  

	if (ViewerSettings.nVisibleVertports >= 1)
    	ViewerSettings.nVisibleVertports = 1;

	if (typeof ViewerSettings.barportSizePercent == "undefined")
		ViewerSettings.barportSizePercent = 20*ViewerSettings.nVisibleBarports;
	if (typeof ViewerSettings.barportSizePercent == "string")
		ViewerSettings.barportSizePercent = parseFloat(ViewerSettings.barportSizePercent);


    var vwidth;
    var vheight;

	var wid_offs = 0;
    
    //if (toolBarLeftVisible)
    if ($("#KView_toolBarLeft").css('display')!="none")
     		wid_offs= 40;
 
    if (!that.standalone)
    {
    	vwidth = $("#frame").width()-$("#patientTableContainer").width()-wid_offs;
    	vheight = $("#frame").height()-5;
    }
    else
    {
		vwidth = that.$parentContainer.width()-wid_offs;
		vheight = that.$parentContainer.height()
    }
 
 
    var tWidth  = (vwidth/ViewerSettings.nVisibleCols);
    var tHeight;
    if (nVisibleBarports == 0)
		tHeight = vheight /(ViewerSettings.nVisibleRows);
    else
    	tHeight = (vheight*(1- ViewerSettings.barportSizePercent/100)) /(ViewerSettings.nVisibleRows);

	var $vpcontainer = $("#KView_viewportContainer");
	var vertport_width = viewports[20].width_in_perc;
	if (ViewerSettings.nVisibleVertports > 0 && KViewer.zoomedViewport == -1)
	{
		$vpcontainer.width((vwidth+1)*(1-vertport_width/100));
		$vpcontainer.css('left',vertport_width/100*(vwidth+1));
	}
	else
	{
		$vpcontainer.width((vwidth+1));
		$vpcontainer.css('left',0);
	}
	$vpcontainer.height(vheight+1);

	// not working for ff
	//var margin = parseInt(viewports[0].$container.css('border-width')) + parseInt(viewports[0].$container.css('margin'))
    var margin = 1;
    
	if (!KViewer.standalone)
	{

    	$zoomedPortContainer.width($zoomedPortContainer.parent().width()-margin*2);
    	$zoomedPortContainer.height($zoomedPortContainer.parent().height()-margin*2);
    }
	else
	{

		$zoomedPortContainer.css("top",0)
		$zoomedPortContainer.css("left",0)
		$zoomedPortContainer.width("99%")
        $zoomedPortContainer.height("99%")
/*
		  $zoomedPortContainer.width(window.innerWidth-8 );
		  $zoomedPortContainer.height(window.innerHeight-8 );
		  var rec = $zoomedPortContainer.parent().get(0).getBoundingClientRect()
		  $zoomedPortContainer.css('top',-rec.top-8);
		  $zoomedPortContainer.css('left',-rec.left+30);*/
	}   

    function layoutport(portID,wid,hei)
    {
      if (KViewer.zoomedViewport == -1) //!viewports[portID].isZoomed())
      {
        viewports[portID].$container.css('width',wid);
   //     viewports[portID].$container.width(wid);
        viewports[portID].$container.height(hei);        
      }
      else
      {
      	  if (viewports[portID].isZoomed())
      	  {
			  viewports[portID].$container.css('width',"100%");
			  viewports[portID].$container.css('height',"100%");
			  viewports[portID].$container.css('left',0);
      	  }
      	  else
      	  {
      	  	  var w = $("#patientTableContainer").width()-5;
      	  	  var h = (w>220)?220:w;
			  viewports[portID].$container.css('width',w);
			  viewports[portID].$container.css('height',h);
      	  }
      }
        viewports[portID].visible = true;
        if (viewports[portID].getCurrentViewer())
        {
            viewports[portID].getCurrentViewer().setInnerLayout();        
        }
    
    }





    for(var k=0;k<nVisibleViewports;k++)
    {
      var ck = math.floor(k/ViewerSettings.nVisibleCols);
      var rk = k%ViewerSettings.nVisibleCols;
      var portID = vpAssignment[ck][rk]
      layoutport(portID,(viewports[portID].width_in_perc  -2) + '%',  tHeight-2*margin)      
    }

 	for(var k=0;k<ViewerSettings.nVisibleBarports;k++)
	    layoutport(15+k,'98%', vheight*ViewerSettings.barportSizePercent/100/nVisibleBarports-2*margin);

    for(var k=0;k<ViewerSettings.nVisibleVertports;k++)
    {
       viewports[20+k].$container.css('left',-vertport_width/100*(vwidth+1));
	   layoutport(20+k,vertport_width/100*(vwidth+1)+'px', vheight-2*margin);
    }

    signalhandler.send("layoutHisto");

  }


  // ======================================================================================
  // state toggler
  // ======================================================================================

  function togglePixelated()
  {   
      $pixelatedToggle.toggleClass('KView_tool_enabled');
      $('.KViewPort_canvas').toggleClass('KViewPort_canvas_pixelated');                          
  }


  function toggleInfobar()
  {
    $infobarToggle.toggleClass('KView_tool_enabled');
    if(that.showInfoBar == false)
       that.showInfoBar = true;
    else
       that.showInfoBar = false;
    signalhandler.send("updateInfoBar");
  }
  that.toggleInfobar = toggleInfobar;


  function toggleGlobalCoordinates()
  {
  	$globalCoordinatesToggle.toggleClass('fa-check');
    that.globalCoordinates = !that.globalCoordinates;
	signalhandler.send("positionChange", {mosaicdraw: true} );
  }


  function toggleCrossHair()
  {
    $crossHairToggle.toggleClass('KView_tool_enabled');
    if(that.crosshairMode == false)
       that.crosshairMode = true;
    else
       that.crosshairMode = false;
    signalhandler.send("drawHairCross");
  }

  function toggleHistogram()
  {
    $histoToggle.toggleClass('KView_tool_enabled');
    if(that.histoMode == false)
       that.histoMode = true;
    else
       that.histoMode = false;
    signalhandler.send("layoutHisto");
  }



  function toggleElementsForScreenShot()
    {
      function tog(vis)
      {
          $(".KViewPort_container").toggleClass('noBorder');
		  viewports.forEach(function(e) {
			if(e.getCurrentViewer() != undefined)
			{
			 if (e.getCurrentViewer().viewerType == 'medViewer')
			 {
			   if (vis)
			   	  e.getCurrentViewer().showControls();
			   else
			   	  e.getCurrentViewer().hideControls();
			 }
			}      	});
      }
      controlsOn = !controlsOn;
	  tog(controlsOn);
    }
  that.toggleElementsForScreenShot = toggleElementsForScreenShot;





  that.getCurrentViewerContent = function(type)
  {
    var objs = {};
    for(var k = 0; k < viewports.length; k++)
    {
      var viewer = viewports[k].getCurrentViewer();
      if (viewer != undefined)
     	 if(viewer.viewerType == type )
     	 {
          	var obj = viewer.content;
          	objs[viewer.currentFileID] = obj;
     	 }
    }
    return objs;
  }




  function toggleLeftBar()
  {
    var any_ktool_enabled = false;
    for (var k = 0; k < ktoolslist.length;k++) any_ktool_enabled = any_ktool_enabled | ktoolslist[k].enabled ;

    toggleTableHide();

    if (!any_ktool_enabled)
        ktoolslist[0].toggle();

  }


  function toggleTableHide()
  {
    var tableContainer = $("#patientTableContainer");
    if (!TableHidden)
    {
      tableContainer = $("#patientTableContainer").detach();
      setViewPortLayout();
      $("#KView_viewportContainer").css("width","100%");
      TableHidden = true;
      signalhandler.send("positionChange")
    }
    else
    {

      $(tableContainer).prependTo($("#container"));
      setViewPortLayout();
      setPatientTableLayout();
      TableHidden = false;
      signalhandler.send("positionChange")


    }
  }
  that.toggleTableHide = toggleTableHide;


    // some settings we do not want to change ofter. These might go into a general config, or into the viewer settings in future
	that.static = {};
	that.static.mousespeed_zoom = 1;
	that.static.mousespeed_clims  = 1;
	that.static.mousespeed_roipensize = 1;
	that.static.lazydraw_timeout = 150;

  that.applyState = function()
  { 

    // this should be kept as own copy, can be overwritten by auto find 
      that.defaultFOV_mm  = ViewerSettings.defaultFOVwidth_mm;
      that.crosshairMode = ViewerSettings.crosshairModeDefault;
      that.histoMode = ViewerSettings.histoModeDefault;
      that.showInfoBar = ViewerSettings.showInfoBar;
      that.toggleMainViewport(ViewerSettings.mainViewport, true);
      that.globalCoordinates = ViewerSettings.globalCoordinates;


      if (!that.globalCoordinates) 	
			$globalCoordinatesToggle.removeClass('fa-check');
      if (!that.histoMode)		  
        $histoToggle.removeClass('KView_tool_enabled');
      else 
        $histoToggle.addClass('KView_tool_enabled');        
      if (!that.crosshairMode) 	
        $crossHairToggle.removeClass('KView_tool_enabled');
      else
        $crossHairToggle.addClass('KView_tool_enabled');
      if (!that.showInfoBar)
        $infobarToggle.removeClass('KView_tool_enabled');
      else 
         $infobarToggle.addClass('KView_tool_enabled');


       $Csystem_ul.find(".fa-check").removeClass("fa-check");
       $Csystem_ul.find("li[id='"+ViewerSettings.permOrder +"']").children().addClass('fa-check')


       autoloader_toggle(state.viewer.enableAutoloaders);
     
       reattachViewports(); 
       setViewPortLayout([ViewerSettings.nVisibleRows, ViewerSettings.nVisibleCols]);
       signalhandler.send("positionChange");
  }

  // this will put the local settings (that....) to state.viewer such that these variables will be stored in the state
  that.saveState = function()
  {
	  ViewerSettings.defaultFOV_mm 	 		=  that.defaultFOVwidth_mm;
      ViewerSettings.crosshairModeDefault 	=  that.crosshairMode;
      ViewerSettings.histoModeDefault 		=  that.histoModeDefault;
      ViewerSettings.showInfoBar			=  that.showInfoBar;
      ViewerSettings.globalCoordinates 		=  that.globalCoordinates;

  }
  
  that.applyNewViewportLayout = function()
  { 
    setViewPortLayout([ViewerSettings.nVisibleRows,ViewerSettings.nVisibleCols]);
    signalhandler.send("positionChange");
  }




  //////////////////////////////////// take a screenshot /////////////////
  function takeScreenshot(ev)
  {
  
      toggleElementsForScreenShot();
      $(".KViewPort_container").addClass('noBorder');

      html2canvas($viewportContainer).then(function(canvas)
      {
         var blob = dataURItoBlob(canvas.toDataURL());
		 saveScreenShot(blob,{});
       
      });
   
      toggleElementsForScreenShot();
      $(".KViewPort_container").removeClass('noBorder');
  }



  //loadTestFileOnStartup(); /// load a test file
  function loadTestFileOnStartup()
  {
    var myownurl = window.location.href.split('?')[0];
    var params = new Object();
    params.URLType  = 'serverfile';
    params.fileID    = '45';
    viewports[0].openFile(params);

  }

  /** closes all content 
   * @function
   */
  function closeAll(callbackIfYes, whattoclose_in)
  {
  	
  	// we can control what to close, can eg be set in autoloader
  	var whattoclose = 
  	{
  		markerProxy: 1,
  		dataManager: 1,
  	}
  	whattoclose = $.extend(0, whattoclose, whattoclose_in)

    var unsaved = unsavedChanges();
    if(unsaved)
    {
		alertify.confirm("Are you sure to close the current view, there are unsaved " + unsaved + "!",function(e)
		{
			if (e) {  doIt(); }
		});
    }
	else
	   doIt();

	function doIt()
	{

		if (KViewer.zoomedViewport != -1)
			KViewer.unZoomViewport();

		if( whattoclose.markerProxy == 1 && markerProxy != undefined)
			markerProxy.reset();  

		signalhandler.send("close");
		if ( whattoclose.dataManager && ( userinfo.username != guestuser || electron) )
			KViewer.dataManager.clearMemory();

		that.defaultFOV_mm = state.viewer.defaultFOVwidth_mm;

	//	KViewer.resetCrossHair();				
		that.currentPoint.reset = true
	

		for (var k in KPanel.currentPanels)
		{
			if (KPanel.currentPanels[k].closeOnCloseAll)
				KPanel.currentPanels[k].close();
		}

		if (KViewer.roiTool && KViewer.roiTool.closePolyTool)
		    KViewer.roiTool.closePolyTool();


        that.movie.currentTimePoint = 0;

		if(callbackIfYes)
			callbackIfYes();
	}

  }  
  that.closeAll = closeAll;        


	that.findAllViews = function(type)
	{
		var fvs = [];
		that.iterateMedViewers(function(m)
		{
			if (m.objects3D)
				for (var k = 0 ; k < m.objects3D.length; k++)
				{
					if (m.objects3D[k][type])
						fvs.push(m.objects3D[k]);
				}

		});

		return fvs;

	}

	// ======================================================================================
	// Tools
	// ======================================================================================
	// Tools should in general be defined via the ToolProxy. This way, they are only "truly" created when needed -> save memory and startup time


	/** the local files manager {@link KCacheManager} */
	that.cacheManager = ToolProxy('cacheManager',"KCacheManager",'Local Files');
	/** the local files manager {@link KRoiTool} */
	if (typeof KRoiTool != "undefined")
		that.roiTool = ToolProxy('roiTool',"KRoiTool",'ROIs');
	/** the 3dobj manager {@link KObject3DTool} */
	if (typeof KObject3DTool != "undefined")
		that.obj3dTool = ToolProxy('obj3dTool',"KObject3DTool",'Objects 3D');
	/** the atlas tool {@link KAtlasTool} */
	if (typeof KAtlasTool != "undefined")
		that.atlasTool = ToolProxy('atlasTool',"KAtlasTool",'Atlas');
	/** to manage forms {@link KFormManager} */
	if (typeof KFormManager != "undefined")
		that.formManager = ToolProxy('formManager',"KFormManager",'Forms');
	/** tha markers points tool {@link KAnnotationTool} */
	//that.annotationTool = ToolProxy('annotationTool',KAnnotationTool,'Stereotaxy');
	/** tha markers points tool {@link KAnnotationTool} */
	if (typeof KMarkerTool != "undefined")
		that.markerTool = ToolProxy('markerTool',"KMarkerTool",'MarkerTool');
	/** navi tool {@link KNavigationTool} */
	if (typeof KNavigationTool != "undefined")
		that.navigationTool = ToolProxy('navigationTool',"KNavigationTool",'Navigation');
	/** curve tool {@link KNavigationTool} */
	if (typeof KMedImgCurve != "undefined")
		that.curveTool = ToolProxy('curveTool',"KMedImgCurve",'CurveTool');
	/** roi tool {@link KNavigationTool} */

    if (!electron)
    {
		if (typeof KReadingTool != "undefined")
			that.readingTool = ToolProxy('readingTool', "KReadingTool",'ReadingTool');
    }

  	// create the menu with the tools
  	KToolWindow.attachToolSelectors($toolbarContainer);



  // ======================================================================================
  // Additional tool shortcuts
  // ======================================================================================
    var $roiToolToggle =  $("<div  class='KView_tool '><i  class='fa fa-pencil fa-1x'></i></div>").appendTo($toolbarContainer)
                           .click( function(){that.roiTool.toggle()} )
                           .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>RoiTool</li>") )
                           );

                          
                               
    if (!electron && application != "webview")
    {
		var $readings =  $("<div  class='KView_tool '><i  class='fa fa-registered fa-1x'></i></div>").appendTo($toolbarContainer)
							   .click( function(){that.readingTool.toggle() } )
							   .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>ReadingTool</li>") )
								   );
    }


	if (typeof KMarkerTool != "undefined")
		var $rulerTool =  $("<div  class='KView_tool '><i  class='fa fa-arrows-h fa-1x'></i></div>").appendTo($toolbarContainer)
							   .click( function(){markerProxy.addRuler()} )
							   .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Ruler</li>") )
								   );

	if (typeof ironSight != "undefined")
		var $iron =  $("<div  class='KView_tool '><i  class='fa fa-crosshairs fa-1x'></i></div>").appendTo($toolbarContainer)
							   .click( function(){ironSight.toggle()} )
							   .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>IronSight Tool</li>") )
								   );
    that.$iron = $iron

	if (electron)
	{

		var $settingsbutton =  $("<div  class='KView_tool '><i  class='fa fa-bars fa-1x'></i></div>").appendTo($toolbarContainer)
							   .click( function(){
								settingsDialog.dialog.toggle()

							   } )
							   .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Settings</li>") )
								   );
		var ipc = require('electron').ipcRenderer;
	    ipc.on('settings', function() { settingsDialog.dialog.toggle() } )
	}

  

	return that;


}



/** @function  */
function createParamsLocalFile(file, intent, progressSpinner)
{

  file.name = file.name.replace(/\\/g,"/");

	
  var params = {};
  params.URLType  = 'localfile';
  params.fileID = 'localfile_'   + file.name ;

  runningID++;
  params.filename = 'localfile://' + file.name;
  params.file   = file
  params.intent = intent;

  // drop as roi if filename indicates a roi
  if(file.name.search('\\.nii') > 0 | file.name.search('\\.mgh') > 0  | file.name.search('\\.mgz') > 0)
	  if( file.name.search(/mask/) != -1 || file.name.search(/roi/) != -1 )
	  {
		if(params,intent == undefined)
			params.intent = {};
		params.intent.roi = 1

	  }

  if(progressSpinner)
	params.progressSpinner = progressSpinner;

  return params;

}



document.addEventListener("keydown", function(evt) {
  evt = evt || window.event;
  if ( evt.keyCode == 17)
  {
     signalhandler.send("hairfocus_receive_event");
  }
});


document.addEventListener("keyup",function(evt) {
  evt = evt || window.event;
  if (evt.keyCode == 17 )
   	 signalhandler.send("hairfocus_ignore_event");
});



