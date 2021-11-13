
KFreeView.runningID = 0;

function KFreeView(master,$parent)
{

	 var viewPortID = 50+KPanelView.runningID++;

	 var that = new KViewPort(master, viewPortID);
     that.$container.appendTo($parent);

     that.resize = function()
	 {
	 	that.$container.width($parent.width());
		that.$container.height($parent.height());
		if (that.getCurrentViewer())
			that.getCurrentViewer().setInnerLayout();
	 }

	 that.kill = function(){

	 	that.panel.close()
		if (that.getCurrentViewer())
			that.getCurrentViewer().close();
	 	KViewer.viewports.splice(viewPortID,1);
	 };

	
	 KViewer.viewports[viewPortID] = that;	

     that.resize();

	 return that ;	


}


KPanelView.runningID = 0;
function KPanelView(master,name,options)
{
     if (name == undefined)
     name = "Viewport";

     if (options == undefined)
     {
     	options = {
     		showElements:false     		
     	}
     }


	 var panel = KPanel($(document.body),'viewportpanel'+(KPanelView.runningID++), name);
	 panel.$container.height("500px")
     panel.$container.width("500px")
     panel.closeOnHide = true;


	 var that = new KFreeView(master,panel.$container);
	 that.panel = panel;


     if (options.addClass)
         that.panel.$container.addClass(options.addClass);



     var $resizeTriangle = resizeTriangle(function() {},that.resize,
      		that.panel.$container ).appendTo(that.$container);

	 that.setSize = function(w,h)
	 {
	 	panel.$container.width(w)
	 	panel.$container.height(h)
		that.resize();

	 }


	 that.onsetContent = function()
	 {
	 	if (that.medViewer != undefined & !options.showElements)
	 	{
	 		that.medViewer.hideControls();
	 		that.medViewer.histoManager.hide()
	 		that.medViewer.histoManager.hidden = true;
	 		that.medViewer.$infobar.hide();
	 		that.medViewer.$infobar.hidden = true;

	 	}
	 }


	 that.panel.customClose = function()
	 {
	 	that.$container.remove();
		signalhandler.detach("close",that.sigid);
		that.kill();


	 }

	 that.sigid = signalhandler.attach("close",function() {
		that.kill()
		signalhandler.detach("close",that.sigid);
	});
 


	 return that ;	
}


function KViewPort(master, viewPortID)
{
  /** @class 
   * The viewport object which can contain different types of viewers.
   *  @alias KViewPort */
  var that = new Object();

  /** The main div container
   *  @member */  
  var $container = $("<div id='KViewPort_container_number"+ viewPortID +"' class='KViewPort_container'></div>"); 
  that.$container = $container;

  var $spinner  = $("<div class='KViewPort_spinner' ><i class='fa fa-spinner fa-spin'></i> <span >Loading</span></div>").appendTo($container);


  /** @inner */ that.viewPortID = viewPortID;   


  /** @inner  */
  that.currentFileinfo = new Object();

  /** @private */
  var currentViewer;


  var $numerator = $("<div  class='KView_viewportNumerator' ></div>");
  $('<img  src="'+url_pref+'logo.svg"  >').appendTo( $numerator );
  $container.append($numerator);

  
  var zoomed =0;

  /** @function */
  that.isZoomed = function(){return zoomed};

  /** @function */
  that.zoomViewPort = zoomViewPort;


   that.$LeftViewportCol_resizer = $("<div class='annotion_tool_resizer'><div><div></div></div></div>")
	  .on("mousedown", function (ev)
	  {

		var $pt = $("#patientTableContainer").parent();
		var avail_height =  master.$zoomedPortContainer.height();

		$(document.body).on('mousemove', function(ev) {
				ev.preventDefault();
				ev.stopPropagation();
		 		var t = ev.clientY-$pt.offset().top;
		 		KViewer.setSizeLeftViewportCol(t)
			});
			$(document.body).on('mouseup', function() {
				$(document.body).off('mousemove mouseup');
			});
	  });



  function zoomViewPort(ev,hideTable)
  {

    if(zoomed == 0)
    {

      if (!KViewer.showInfoBar)
      	 KViewer.toggleInfobar();

      zoomed = 1;
      master.$zoomedPortContainer.css({visibility: 'visible'});
      $(".KViewPort_infoDIV").addClass("zoomPortButton")
      $(".KViewPort_title").addClass("zoomPortButton")
      $("#patientThumbBackButton").css('display','block');
	  
/*
  	  var $vpcontainer = $("#KView_viewportContainer");
  	  $vpcontainer.width("100%");
	  $vpcontainer.css('left',0);
*/

 	  that.$LeftViewportCol_resizer.appendTo($("#patientTableLowerContainer"));
	  KViewer.setSizeLeftViewportCol();


	   //   $("[id^=KViewPort_container_number]").css({visibility: 'hidden'});



 	  $("#thetable").hide();
 	  var keys = Object.keys(master.viewports);
      for(var k = 0; k < keys.length; k++)
      {
      	  if (keys[k] != that.viewPortID && master.viewports[keys[k]].getCurrentViewer() != undefined) 
      	  {
      	  	 var vp = master.viewports[keys[k]];
      	  	 var vi = vp.getCurrentViewer();
      	  	 if (vi.viewerType != "Manager")
      	  	 {
      	  	 	 if (vp.$container != undefined)
				 	vp.$container.detach()
				 if (vi.toolbar != undefined)
				 	vi.toolbar.hide()
				 if (vi.layoutbar != undefined)
					 vi.layoutbar.hide()
				 vi.hiddenHisto = true;
				 $("#patientThumbContainer").append(vp.$container)
      	  	 }
      	  }
      }



	  if (!KViewer.standalone)
	  {
		  master.$zoomedPortContainer.width(master.$zoomedPortContainer.parent().width()-8 );
		  master.$zoomedPortContainer.height(master.$zoomedPortContainer.parent().height()-8 );
	  }
	  else
	  {
		  master.$zoomedPortContainer.width(window.innerWidth-8 );
		  master.$zoomedPortContainer.height(window.innerHeight-8 );
		  var rec = master.$zoomedPortContainer.parent().get(0).getBoundingClientRect()
		  master.$zoomedPortContainer.css('top',-rec.top-8);
		  master.$zoomedPortContainer.css('left',-rec.left+30);
	  }


      //currentViewer.toolbar.$close.hide();
      currentViewer.toolbar.$zoom.children().addClass("fa-compress");

	  master.$layoutSelector.addClass('inactive');

 	  master.zoomedViewport = currentViewer.viewport.viewPortID;

	  master.$dummyPortContainer.insertBefore(currentViewer.viewport.$container);
	  currentViewer.viewport.$container.css({visibility: 'visible'});
      currentViewer.viewport.$container.detach();
      currentViewer.viewport.$container.appendTo(master.$zoomedPortContainer);

      master.$dummyPortContainer.width(currentViewer.viewport.$container.width())
      master.$dummyPortContainer.height(currentViewer.viewport.$container.height())
      currentViewer.viewport.$container.width(master.$zoomedPortContainer.width())
      currentViewer.viewport.$container.height(master.$zoomedPortContainer.height())


      currentViewer.setInnerLayout();

      if (!TableHidden & hideTable)
        master.toggleTableHide();

      KViewer.setViewPortLayout();

      signalhandler.send("positionChange layoutHisto");

    }
    else
    {
      zoomed = 0;
 	
	       
      currentViewer.viewport.$container.insertBefore(master.$dummyPortContainer);
      master.$dummyPortContainer.detach();
      currentViewer.viewport.$container.width(master.$dummyPortContainer.width())
      currentViewer.viewport.$container.height(master.$dummyPortContainer.height())

      
	  master.$layoutSelector.removeClass('inactive');

      //currentViewer.$container.detach();


	  master.zoomedViewport = -1;

      master.$zoomedPortContainer.css({visibility: 'hidden'});
      $("[id^=KViewPort_container_number]").css({visibility: 'visible'});

      currentViewer.toolbar.$zoom.children().removeClass("fa-compress");
      currentViewer.setInnerLayout();

      if (TableHidden & !KViewer.standalone)
         master.toggleTableHide();

	  if (userinfo.username != guestuser || static_info.public_projects)     
      	$("#thetable").show();
 
  	  var keys = Object.keys(master.viewports);
 	  for(var k = 0; k < keys.length; k++)
      {
      	  if (keys[k] != that.viewPortID && master.viewports[keys[k]].getCurrentViewer() != undefined) 
      	  {
      	  	 var vp = master.viewports[keys[k]];
      	  	 var vi = vp.getCurrentViewer();
			 if (vi.viewerType != "Manager")
      	  	 {
      	  	 	 if (vi.toolbar != undefined)
				 	vi.toolbar.show()
      	  	 	 if (vi.layoutbar != undefined)
					 vi.layoutbar.show() 
				 vi.hiddenHisto = false;
      	  	 }
      	  }
      }

 	
      KViewer.setViewPortLayout(); 
	  setPatientTableLayout();   
	  KViewer.setViewPortLayout(); 

      $(".KViewPort_infoDIV").removeClass("zoomPortButton")
      $(".KViewPort_title").removeClass("zoomPortButton")
      $("#patientThumbBackButton").css('display','none');


      signalhandler.send("positionChange layoutHisto");
 


    }
  }


  /** @function */
  function getCurrentViewer(){return currentViewer};
  that.getCurrentViewer = getCurrentViewer;
  
  /** @function  */
  that.setCurrentViewer = function(v)
  {
	if (v == currentViewer)
		return;

  	if (v != undefined)
  	{
  		 
  		if (currentViewer != undefined)
			currentViewer.$container.detach();
		
		$container.append(v.$container);
		currentViewer = v;
  		$numerator.hide();
  	}
  	else 
  	{
  		if (currentViewer != undefined)
			currentViewer.$container.detach();
  		currentViewer = undefined;
  		$numerator.show();
  	}
  };
 
  that.progressSpinner = theSpinner($spinner);
 
  that.setContent = setContent;
  /** depending on fileObject activates a certain viewer and sets its content
   *  to fileObject 
   *  @param {object} fileObject - object describing file (see {@link createParamsLocalFile} or 
   								   {@link KDataManager~processLoadedFile} for creation).
   *  @param {string} fileObject.contentType - What kind of data (nii,tracts,bmp,tab,doc,txt,...)
   *  @param {object} fileObject.content - the data object
   *  @param {string} fileObject.fileID - the sql-id (numeric) or url of local file
   *  @param {string} fileObject.filename - the name of the file
   *  @param {object} fileObject.fileinfo - more detailed object information
   *  @param {object} params - additional loading parameters
   *  @param {object} params.intent - several intentions what to do (use as overlay, show in 3D etc)   
   *  @param {string} params.URLType 
   *  @param {callback} params.callback
   */ 


  function setContent(fileObject,params)
  {
    if (fileObject == undefined)
       return;

    if (fileObject.content == false)
       return;

    if (that.visible != undefined && that.visible == false)
        return;

    if (params.intent == undefined)
	   params.intent = {};
        

    if(fileObject.contentType == 'nii')
    {
		
		// ************ convert a single slice RGB nifti to bmp **********
		if( !state.viewer.loadBitmapAsNifti & (fileObject.content.datatype == 'rgb24' && fileObject.content.sizes[2] == 1) )
		{
        	bmpViewer.setContent(fileObject,params);
		}
		else
		{
        	if (fileObject.fileinfo.Tag)
			{
			  if (fileObject.fileinfo.Tag.search("/mask/") != -1)
			  {
			//            master.roiTool.pushROI(fileObject.fileID,"untitled","frommaskfile");
				if (params.intent == undefined) params.intent = {};
				params.intent.ROI = true;
				medViewer.setContent(fileObject,params);
			  }
			  else
				medViewer.setContent(fileObject,params);
			}
			else
			{
			  medViewer.setContent(fileObject,params);
			}
		}

    }
    else if (fileObject.contentType == 'tracts' | fileObject.contentType == 'gii' | fileObject.contentType == 'rtstruct')
    {
      medViewer.setContent(fileObject,params);    	
    }
    else if(fileObject.contentType == 'bmp')
    {
      bmpViewer.setContent(fileObject,params);
    }
    else if(fileObject.contentType == 'tab')
    {
      tableViewer.setContent(fileObject,params);
    }
    else if(fileObject.contentType == 'doc')
    {
      ViewerJS.setContent(fileObject,params);
    }
    else if(fileObject.contentType == 'txt')
    {
      txtViewer.setContent(fileObject,params);
    }
    else if(fileObject.contentType == 'json')
    {
       var tag = " " + fileObject.fileinfo.Tag;
       if (params.intent == undefined) params.intent = {};
       if (!params.intent.asjson && (tag.search("FORM") >= 0 | params.intent.patientedit |             
            params.intent.studyedit | (fileObject.filename || "").search("\\.form\\.json") != -1))
       {
          formViewer.setContent(fileObject,params);
       }
       else if (tag.search("RO") >= 0 | fileObject.filename.search("\\.transform\\.json") != -1)
       {
          master.setReorientationMatrix(fileObject);
       }
// moved to datamanager       
/*       else if (tag.search("ANO") >= 0 | fileObject.filename.search("\\.ano\\.json") != -1 )
       {
          markerProxy.loadAnnotations(fileObject);

          // only show markerTool if no panel / panel not visible
          if(markerProxy.currentSet &&  markerProxy.currentSet.markerPanel && markerProxy.currentSet.markerPanel.panelvisible)
          {
				// do nothing ( no show )
          }
          else
          {
          	if ( !KViewer.markerTool.enabled )
	          	 KViewer.markerTool.toggle();
          }
       }*/
       else if (fileObject.filename.search("\\.cc.json") != -1)
       {
		  medViewer.setContent(fileObject,params);     	
       }
       else
       {
         jsonViewer.setContent(fileObject,params);
       }
    }

    if (params.json && params.json.project)
    {
    	fileObject.project = params.json.project; 
    }

    if (that.onsetContent)
    {
    	setTimeout(function() {that.onsetContent(fileObject,params)},0);
    }
    	


   }

   var isFiberVol = false;

   // to improve Kview startup dragster creation is postponed by timeout
   setTimeout(function($container,that) { return function() {
	   new Dragster($container.get(0));
	   $container.get(0).addEventListener('dragenter',showDropIndicators);
	   $container.get(0).addEventListener('dragster:leave',hideDropIndicators);

	   var $dropIndicator = $("<div class='KView_viewportdropIndicator' ></div>").hide().appendTo($container);
	   that.$dropIndicator = $dropIndicator;

	   var isOrthoDropper = true; //viewPortID === 0 | viewPortID == 4 ;
	   var orthodrop = "";


	   if (isOrthoDropper)
		  orthodrop = "<div droptag='orthooverlay'> as orthoview </div>";

	   that.dragster = {};
	   that.dragster.notpossible =  $("<div> not possible</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.loadworkspace =  $("<div>load workspace</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.tool =  $("<div>drop tool</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.doc =  $("<div>drop document</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.roi =  $("<div>drop ROI "+orthodrop+" </div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.fibers =  $("<div droptag='fibers'>drop fibers</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.asjson =  $("<div droptag='asjson'> drop as json</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.obj3D =  $("<div>drop 3D object</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.surfacecol =  $("<div  droptag='surfcol'>drop as surface coloring</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.image =  $("<div droptag='image'>drop image</div>").hide().appendTo(that.$dropIndicator);
	   that.dragster.ortho = $("<div droptag='orthoview'>drop as orthoview</div>").hide();
	   if(isOrthoDropper)
		   that.dragster.ortho.appendTo(that.$dropIndicator);
	   that.dragster.overlay = $("<div droptag='overlay'>drop as overlay "+orthodrop+" </div>").hide().appendTo(that.$dropIndicator); 
	   that.dragster['default'] = $("<div> drop content</div>").hide().appendTo(that.$dropIndicator);

	   $dropIndicator.children().each(function(k,e){ 
			$(e).on('dragover',  function(ev){ $(e).css('background', 'rgba(0,139,139,0.6)');}) 
			$(e).on('dragleave', function(ev){ $(e).css('background', 'rgba(139, 0, 0, 0.6)');}) 
			});

	  } }($container,that),100);

	  function showDropIndicators(e)
	  {
	  	var $dropIndicator = that.$dropIndicator;

		if (currentViewer != undefined && currentViewer.viewerType == "Manager")
				return;
	  	
	  	for (var obj in that.dragster)
		    that.dragster[obj].hide();     

	  	if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types[0] == 'text/plain')
	  	{
	  		that.dragster.notpossible.show();
	  		$dropIndicator.fadeIn(150)
	  		return;
	  	}

		if (tempObjectInfo != undefined && tempObjectInfo.length > 0)
		{
			if (KViewer.zoomedViewport != -1 && !that.isZoomed() )
				that.dragster['notpossible'].show();				
			else if ((tempObjectInfo[0].tag || "").search("/mask/") > -1)
			{
				that.dragster.roi.show();
			}
			else if ((tempObjectInfo[0].tag || "").search("/WORKSPACE/") > -1)
			{
				that.dragster.loadworkspace.show();
			}
			else if ((tempObjectInfo[0].filename || "").search("\\.gii") > -1)
			{
				that.dragster.obj3D.show();
			}
			else if (tempObjectInfo[0].mime == 'nii')
			{
				that.dragster.image.show();
				that.dragster.ortho.show();
				that.dragster.overlay.show();
				if (that.medViewer != undefined && that.medViewer.hasContent('surf') != undefined)
				 	that.dragster.surfacecol.show();
 				if ((tempObjectInfo[0].filename || "").search("cosl") > -1 |
 				    (tempObjectInfo[0].filename || "").search("rgb") > -1 |
 				    (tempObjectInfo[0].tag || "").search("tck") > -1 )	
 				{		 	
					that.dragster.fibers.show();
					isFiberVol = true
 				}

			}
			else if ((tempObjectInfo[0].filename || "").search("\\.tck") > -1)
			{
				that.dragster.fibers.show();
			}
			else if (tempObjectInfo[0].mime == 'json' | tempObjectInfo[0].mime == 'form')
			{
				that.dragster.asjson.show();
			}
			else if (tempObjectInfo[0].mime == 'pdf')
				that.dragster.doc.show();
			else if (tempObjectInfo[0].type == 'markertemplate')
				1
			else
				that.dragster['default'].show();
		}
		else if (KToolWindow.dragTool != undefined)
			that.dragster.tool.show();			
		else
			that.dragster['default'].show();
		$dropIndicator.fadeIn(150)
	  }

	  function hideDropIndicators(e)
	  {    
	     if (that.$dropIndicator)
			 that.$dropIndicator.fadeOut(150,undefined, function(){ });
	  }
	  that.hideDropIndicators = hideDropIndicators;

	  $container.on("dragover",  function(ev)
	  {	  
		ev.preventDefault(); 
		return false;
	  });
/*	  $container.on("dragenter",  function(ev)
	  {	  
		ev.preventDefault(); 
		return false;
	  });
  	  $container.on("dragleave",  function(ev)
	  {	  
	    ev.preventDefault(); 
		return false;
	  });
*/
	
	  var ondrop = function(ev)
	  {
	  	if (ev.originalEvent)
		    ev = ev.originalEvent;
		that.$dropIndicator.fadeOut(150);
		that.$dropIndicator.children().each(function(k,e){$(e).css('background', 'rgba(139, 0, 0, 0.6)') });
		
		ev.preventDefault();
		ev.stopPropagation();

		if (ev.dataTransfer && ev.dataTransfer.types && ev.dataTransfer.types[0] == 'text/plain')
	  		return;
	  


		if (KToolWindow.dragTool != undefined)
		{
			KToolWindow.dragTool.show(that);
			KToolWindow.dragTool = undefined;
			return;
		}

		if (currentViewer != undefined && currentViewer.viewerType == "Manager")
			return;

		if (KViewer.zoomedViewport != -1 && !that.isZoomed())
			return;


		if (KViewer.zoomedViewport != -1 && tempObjectInfo[0].intent && tempObjectInfo[0].intent.viewport != undefined)
		{
			zoomViewPort();
			KViewer.viewports[tempObjectInfo[0].intent.viewport].zoomViewPort();
			return;
		}

		var droptag = $(ev.target).attr('droptag');
		
		var params = getloadParamsFromDrop(ev,{});
		var dt = ev.dataTransfer;
		if(dt && dt.items && dt.items[0] && dt.items.length > 0 && dt.items[0].webkitGetAsEntry() && dt.items[0].webkitGetAsEntry().isDirectory)
		{
			alertify.error("You cannot drop folders here. <br> Drop on left panel instead to read folder content.")
			return;
		}
		if (params.patient_study_drop)
		{
			var psid = params.patient_study_drop.split(riddelim);
			startAutoloader(ViewerSettings.autoloaders, {piz:psid[0],sid:psid[1]});
			return;
		}

		if(droptag=='fibers' && isFiberVol)
		{
            
			for (var k = 0; k < params.length;k++)
				params[k].intent = {overlay:true,visible:false,hideview:true};
			
			initiateLoadData(params,function() {
				for (var k = 0; k < params.length;k++)
					params[k].intent = {createFiberTracking:{color:3}};
				initiateLoadData(params);
			});
			
		}
	    else if(droptag=='orthoview')
		{
			loadOrthoview(params[0],viewPortID);
		}
		else if(droptag=='orthooverlay')
		{
            var cnt = 0;
    		cleanAllDropIndicators();

			function itovl()
			{
				if (cnt >= params.length)
				    return;				   
				if (params[cnt].intent == undefined)
					params[cnt].intent = {overlay:true};
				else
					params[cnt].intent.overlay = true;
				loadOrthoview(params[cnt++],viewPortID,itovl);				    
			}

			itovl();
		}
		else if(droptag=='surfcol')
		{

			 var surfs = that.medViewer.hasContent('surf');
			 if (surfs.length > 1)
			 {
				 var menu = KContextMenu(
				  function() {
					var $menu = $("<ul class='menu_context'>");
					for(var k = 0; k < surfs.length;k++)
						$menu.append($("<li onchoice='"+surfs[k].surf.fileID+"' > "+surfs[k].surf.filename+" ("+surfs[k].surf.fileID+")</li>"));
					return  $menu;                									  

				  },
				  function(str,ev)
				  {
							for (var k = 0; k < params.length;k++)
							{
								if (params[k].intent == undefined)
									params[k].intent = {surfcol:str};
								else
									params[k].intent.surfcol = str;
							}
							initiateLoadData(params);
				  },false)
				  menu(ev);
			 }
			 else
			 {
				for (var k = 0; k < params.length;k++)
					if (params[k].intent == undefined)
						params[k].intent = {surfcol:surfs[0].surf.fileID};
					else
						params[k].intent.surfcol = surfs[0].surf.fileID;
				initiateLoadData(params);
			 }
		}
		else if (tempObjectInfo && tempObjectInfo[0] && tempObjectInfo[0].mime == "tck" && tempObjectInfo[0].dirvolref)
		{
		  	params[0].intent = {createFiberTracking:tempObjectInfo[0].dirvolref};
		  	initiateLoadData(params[0]);
		}
		else if(droptag=='overlay' | ev.ctrlKey)
		{
			for (var k = 0; k < params.length;k++)
			{
				if (params[k].intent == undefined)
					params[k].intent = {overlay:true};
				else
					params[k].intent.overlay = true;
			}
			initiateLoadData(params);
		}
		else 
		{
			if(params.type == 'markertemplate')
			{
				params.callback(ev, params, that);
				return 
			}
			else if(params.type == 'tagpaneltag')
			{
				params.callback(ev, params, that);
				return 
			}
			else if(params.length > 1 && ev.dataTransfer.files.length > 0)
			{
				alertify.error("You cannot drop multiple local files. Drop on left panel instead.");
				return
			}

			var bruker;
			if(BrukerReader) 
				bruker = BrukerReader.checkForBrukerData(params)
			if (bruker !== undefined )
			{
				BrukerReader.loadBruker(bruker, master.viewports[viewPortID].setContent) ;
				return;
			}
			if (typeof DicomReader != "undefined")
			{
				var dicomReader = new DicomReader();
				var dicomFileList = dicomReader.checkForDicomData(params)
				if(dicomFileList.length > 0)
				{
					//for(var k=0;k<params.length;k++) 
					//	params[k].progressSpinner = that.progressSpinner;
					// dicomReader.loadDicoms(params, master.viewports[viewPortID].setContent);
					alertify.error("You cannot drop DICOMS directly to viewport.<br> Drop on left panel instead.")
					return;
				}
			}

			for (var k = 0; k < params.length;k++)
			{
				if (droptag=='image' && params[k].intent)
				  params[k].intent.overlay = false;
				if (droptag=='asjson' && params[k].intent)
				 params[k].intent.asjson = true;
			}

            params[0].intent.drop = true;
			initiateLoadData(params);
			
		}

		if (typeof tempObjectInfo != "undefined" && tempObjectInfo.shiftKey)
		{
			if (params[0].close)
				params[0].close();
		}

		cleanAllDropIndicators();

	  }

  	  $container[0].ondrop= ondrop;
  	  that.ondrop = ondrop;



      // horizontal viewport resizer


		that.$container.on("mouseleave",function(ev)
		{
			if (KViewer.in_viewport_resizing_phase)
				return;
			$container.removeClass("resizebar-x resizebar-y");
			$container.css('cursor', '');
			
		});

		that.$container.on("mousemove",function(ev)
		{
			if (zoomed || KViewer.in_viewport_resizing_phase || that.viewPortID > 11)
				return;
			KViewer.on_viewport_resizing = false;
			if (Math.abs(ev.originalEvent.clientX-$container.offset().left-$container.width()) < 5)
			{
				$container.css('cursor', 'ew-resize');
				$container.addClass("resizebar-x");
				KViewer.on_viewport_resizing = true;
			}
			else if (Math.abs(ev.originalEvent.clientY-$container.offset().top) < 5) 
			{
				if ($container.attr("id") == "KViewPort_container_number15")
				{
					$container.css('cursor', 'ns-resize');
					$container.addClass("resizebar-y");
					KViewer.on_viewport_resizing = true;
				}
			}
			else
			{
				$container.css('cursor', '');
				$container.removeClass("resizebar-x resizebar-y");
			}

		});


		that.$container.on("mouseenter",function(ev)
		{
			that.hasMouse = true;
		})

		that.$container.on("mouseleave",function(ev)
		{
			that.hasMouse = undefined;
		})


		that.$container.on("mousedown",function(ev)
		{

		    KViewer.on_viewport_resizing = false;

			if (that.right_neighbor == "cartridge")
			{
				if (Math.abs(ev.originalEvent.clientX-$container.offset().left-$container.width()) < 5)
				{	
					var wid = KViewer.$viewportContainer.width();
					var startx;
					var start_wid_that = that.width_in_perc
					KViewer.in_viewport_resizing_phase = true;

					$(document.body).css('cursor', 'ew-resize');
					$(document.body).on("mousemove", movehandler_x);
					$(document.body).on("mouseup.resizer", uphandler);
					$(document.body).on("mouseleave.resizer", uphandler);
					startx = ev.pageX;
				}
				function movehandler_x(ev)
				{
					ev.preventDefault();
					ev.stopPropagation();
					var delta = (startx-ev.pageX)/wid*50;
					that.width_in_perc = start_wid_that - delta;
					KViewer.setViewPortLayout();
				}


			}
			else
			{



				if (KViewer.viewports[that.right_neighbor] == undefined)
					return;


				if (Math.abs(ev.originalEvent.clientX-$container.offset().left-$container.width()) < 5)
				{	
					var wid = KViewer.$viewportContainer.width();
					var startx;
					var start_wid_that = that.width_in_perc
					var start_wid_next = KViewer.viewports[that.right_neighbor].width_in_perc;

					KViewer.in_viewport_resizing_phase = true;

					$(document.body).css('cursor', 'ew-resize');
					$(document.body).on("mousemove", movehandler_x);
					$(document.body).on("mouseup.resizer", uphandler);
					$(document.body).on("mouseleave.resizer", uphandler);
					startx = ev.pageX;
				}

				function movehandler_x(ev)
				{
					ev.preventDefault();
					ev.stopPropagation();
					var delta = (startx-ev.pageX)/wid*100;
					that.width_in_perc = start_wid_that - delta;
					KViewer.viewports[that.right_neighbor].width_in_perc = start_wid_next + delta;
					KViewer.setViewPortLayout();
				}

				function movehandler_y(ev)
				{
					ev.preventDefault();
					ev.stopPropagation();
					var delta = (starty-ev.pageY)/hei;
					state.viewer.barportSizePercent = start_hei_that + delta*100;

					KViewer.setViewPortLayout();
				}

			}


			function uphandler()
			{
				$(document.body).off();
				$(document.body).css('cursor', '');			
				$container.removeClass("resizebar-x resizebar-y");	
				KViewer.in_viewport_resizing_phase = false;
			}

		});




	 
      function initiateLoadData(params,onready)
	  {
	  	  if(!params )
	  		return false;
	  	  if(currentViewer != undefined && currentViewer.viewerType == 'Manager')
	  	 	 return false;

		  if (Array.isArray(params))
		  {
		  	  if (params.length > 0)
		  	  {
				  initiateLoadData(params[0],function(){

					initiateLoadData(params.slice(1),onready);

				  })			  
		  	  }
		  	  else
		  	  	{
		  	  		if (onready) onready();
		  	  	}

			  return;
		  }
		

		  params.callback = function(ev){
		  	  if (ev != undefined)
			  	 params.obj = ev;
			  master.viewports[viewPortID].setContent(ev,params);                    
			  params.progressSpinner(undefined);
			  if (onready) onready(ev);
		  }

		  params.progressSpinner = that.progressSpinner;
		  that.progressSpinner("Loading data");
		  master.dataManager.loadData(params);
	  }

	  that.openFile = initiateLoadData;


      that.closeContextMenu = function(from) { 

      return KContextMenu(
              function() {
              	var suffix = "";
              	if (from != undefined)
					suffix = '('+from.type+')';
              		
              	var $menu = $("<ul class='menu_context'>").append($("<li onchoice='all' > close all "+suffix+" </li>"));
              	
                return  $menu;                									  
                
              },
              function(str,ev)
              { 

				
				 function delAllObjs(type,subtype)
				 {
				 	KViewer.iterateMedViewers(function (mv){
						var objs = mv[type].slice();
						for (var j = 0 ; j < objs.length;j++)
						{
							if (subtype != undefined)
							{
								if (objs[j][subtype] != undefined)
									objs[j].close();	
							}
							else
								objs[j].close();									
								}
					});
				 }


              	if (str == "all")
                {
                	if (from == undefined)
                	{
						var unsaved = unsavedChanges();
						if (userinfo.username != guestuser & state.viewer.selectionMode[0] == "w" & unsaved != "")
						{
							alertify.confirm("Are you sure to close all, there are unsaved " + unsaved + "!",function(e)
							{ if (e) 
							   KViewer.closeAll() });
						}
						else 
						{
						   signalhandler.send("close");
						}
						return;
                	}
                	else if (from.type == 'overlay')
                		delAllObjs("overlays");
                	else if (from.type == 'surface')
                		delAllObjs("objects3D","surf");
                	else if (from.type == 'fiber')
                		delAllObjs("objects3D","fibers");
                	else if (from.type == 'roi')
                		delAllObjs("ROIs");
                	else if (from.type == 'atlas')
                		delAllObjs("atlas");
                
                }
              	else if (str == "ortho")
                {

                
                }

              } , false) };
              
	
	  that.close = function()
	  {
	  	 if (zoomed)
	  	 	zoomViewPort();
		 if (that.getCurrentViewer())
		 {
		 	if (that.getCurrentViewer().viewerType != 'Manager')
				 that.setCurrentViewer();		 	
		 }
	  }

	//  var medViewer  = new KMedViewer(that, master);
	//  that.medViewer =  medViewer;


	  function dummyViewer(which,constr)
	  {
	  	return { setContent:
	  		function(c,p)
	  		{
				var x = constr(that,master);
				eval(which + '=x');
				eval('that.' + which + '=x');
				x.setContent(c,p);
	  		}
	  	}
	  }

	  var medViewer  = dummyViewer('medViewer',KMedViewer);
	  var bmpViewer  = dummyViewer('bmpViewer',KBmpViewer);
	  var jsonViewer = dummyViewer('jsonViewer',KJsonViewer);
	  var tableViewer = dummyViewer('tableViewer',KTableViewer);
	  var txtViewer = dummyViewer('txtViewer',KTXTViewer);
	  var ViewerJS = dummyViewer('ViewerJS',KViewerJS);
//	  var formViewer = new KFormViewer(that,master  ); //  dummyViewer('formViewer',KFormViewer);
	  var formViewer = dummyViewer('formViewer',KFormViewer);

	  var currentViewer = undefined;

	  return that;

}


