
// ======================================================================================
// ======================================================================================
// ============= KPrototypeViewer
// ======================================================================================
// ======================================================================================



function KPrototypeViewer(viewport, master)
{
	/**  @class 
	   *  @alias KPrototypeViewer */
    var that = new Object();

    that.viewport = viewport;
    that.$container = $("<div class='KViewPort_icontainer'></div>");
    that.$topRow    = $("<div class='KViewPort_topRow'></div>").appendTo(that.$container);
   


    // ======================================================================================
    /**  @class 
	   *  @alias KToolbar */
    
    that.toolbar = {};
    that.toolbar.$container = $("<div class='KViewPort_toolbar'></div>").appendTo(that.$topRow).click(function(ev){return false;});

    that.toolbar.$container.on("mousemove",function(e)
    {
		if (!that.toolbar.issticky)
		{
        	var $t = $(e.target);
        	for (var k = 0; k < 3;k++)
        	{
        	    if ($t.hasClass("minimized"))
        	        return
        	    $t = $t.parent()
        	}

			var trg = $(e.target)
			if (!trg.hasClass("KViewPort_tool"))
				 trg = trg.parent();
	        if ( trg.hasClass("draganddrop") ||
	             trg.hasClass("penciltoggle") ||
	             trg.hasClass("KToolbar_sticky") ||
	             trg.hasClass("KViewPort_tool_cmap") )
	           return;

			if (that.toolbar.stdelay != undefined)
				clearTimeout(that.toolbar.stdelay)
			that.toolbar.stdelay = setTimeout(function(){
			   that.toolbar.show_addons(e,trg);
			   that.toolbar.stdelay = undefined
			},150);

			if (that.toolbar.id != undefined)
				clearTimeout(that.toolbar.id);
			that.toolbar.id = setTimeout(function(){
				that.toolbar.hide_addons();
				that.toolbar.id = undefined;
			},25000);
		}
    });
    that.toolbar.$container.on("mouseleave",function()
    {
    	if (that.toolbar.stdelay != undefined)
    	    clearTimeout(that.toolbar.stdelay)

        if (!that.toolbar.issticky)
        {
			if (that.toolbar.id != undefined)
				clearTimeout(that.toolbar.id);
			that.toolbar.id = setTimeout(function(){
				that.toolbar.hide_addons();
				that.toolbar.id = undefined;
			},500);
        }
        
    });

    that.toolbar.$dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-fw fa-hand-paper-o fa-1x'></i></div>").appendTo(that.toolbar.$container).appendTooltip("dragdropviewport")
	attachhandhover(that.toolbar.$dragdiv);
    that.toolbar.$dragdiv.attr("draggable",'true');
    that.toolbar.$dragdiv.on('mousedown',function(e){e.stopPropagation()})
	that.toolbar.$dragdiv[0].ondragstart = dragstarter(function() { 
	   var dragobj = { type:'file', mime: that.contentType, filename: that.currentFilename,  fileID: that.currentFileID, fromViewPort : that.viewport.viewPortID}; 
	   if (that.extendDragObj)
	       that.extendDragObj(dragobj)
       return dragobj 
    }) 



    that.toolbar.$zoom = $("<div class='KViewPort_tool'><i class='fa fa-expand fa-1x'></i></div>")
                     .click(function(e) {  e.stopPropagation(); viewport.zoomViewPort(); return false; })
					 .on('mousedown',function(e){e.stopPropagation()})
                     .appendTo(that.toolbar.$container).appendTooltip("zoomviewport")
    that.toolbar.$screenshot = $("<div class='KViewPort_tool'><i class='fa fa-camera fa-1x'></i></div>")
					 .on('mousedown',function(e){e.stopPropagation()})
                     .click(function()
							   {
								if (that.type != "mainview")
									takeScreenshot()
							   }                  
                     ).appendTo(that.toolbar.$container).appendTooltip("screenshot")

	if (KViewer.standalone)
	{
		that.toolbar.$screenshot.hide();
	}

    that.toolbar.$close = $("<div  class='KViewPort_tool KViewPort_tool_close'>  <i class='fa fa-close fa-1x'></i></div>")
                     .click(function() { that.close(); }).appendTo(that.toolbar.$container)
                     .mousedown(viewport.closeContextMenu()).appendTooltip("closeviewport")
	

	that.toolbar.hide_mainview = function()
	{
		 $(	 that.toolbar.$container.find(".KToolbarSep")[0]).prevAll().addClass("KTool_displaynone");
	}
	that.toolbar.show_mainview = function()
	{
		 $(	 that.toolbar.$container.find(".KToolbarSep")[0]).prevAll().removeClass("KTool_displaynone");
	}
	that.toolbar.reset_mainview = function()
	{
		 $(	 that.toolbar.$container.find(".KToolbarSep")[0]).prevAll().attr("style","")
	}

	that.toolbar.get_addons = function(e,trg)
	{
		if (e == undefined)
		    return that.toolbar.$container.find(".KToolbarSep").find(".KViewPort_tool").not("input, .persistent, .caption, .draganddrop, .KViewPort_tool_cmap, .KToolbar_sticky");
		else
		{
            if (trg == undefined)
                trg = e.target

			if (trg != undefined)
			{
				var $t = $(trg);
				return $t.nextUntil("br").add($t.prevUntil("br")).add($t)
			}
			else
			{
				return $(e).find(".KViewPort_tool").not("input, .persistent, .caption, .draganddrop, .KViewPort_tool_cmap, .KToolbar_sticky");
			}


		}
	}
	that.toolbar.hide_addons = function()
	{
		that.toolbar.get_addons().addClass("KTool_hidden");
		setTimeout(function(){ 
			if (!that.toolbar.issticky)
			{
				that.toolbar.get_addons().addClass('KTool_displaynone') 
				that.toolbar.$container.find(".KViewPort_tool.caption").addClass("equalwidth");
			}
		},500);
	}	    

	that.toolbar.show_addons = function(e,trg)
	{	/*
	    var trg;
	    if (e != undefined)
	    {
	         trg = $(e.target)
	         if (!trg.hasClass("KViewPort_tool"))
	             trg = trg.parent();
	    }
	    if (e == undefined || 
	       (trg.hasClass("KViewPort_tool") && 
	       !trg.hasClass("draganddrop") &&
	       !trg.hasClass("penciltoggle") &&
	       !trg.hasClass("KViewPort_tool_cmap")
	       ) ) 
	       */

	    
	    if (trg == undefined && e != undefined)
            trg = $(e.target)	       
	   // if (e == undefined)
	    {
			var $thesep = that.toolbar.get_addons(e,trg);
			if ($thesep.length == 1)
			{
				$thesep.addClass('KTool_displaynone');
				return;
			}
			$thesep.removeClass("KTool_hidden KTool_displaynone equalwidth");


			if (!that.toolbar.issticky)
			{
				if (that.toolbar.id != undefined)
					clearTimeout(that.toolbar.id);
				that.toolbar.id = setTimeout(function(){
					that.toolbar.hide_addons();
					that.toolbar.id = undefined;
				},25000);
			}
	    }
	}

    that.toolbar.$stickydiv = $("<div  class='KViewPort_tool KToolbar_sticky'>  <i class='fa fa-fw fa-circle-o fa-1x'></i></div>");
	that.toolbar.issticky = (ViewerSettings.stickytoolbar==undefined) || ViewerSettings.stickytoolbar;
	var toggleSticky = function(){
		if (that.toolbar.id != undefined)
				clearTimeout(that.toolbar.id);
		that.toolbar.issticky = !that.toolbar.issticky;
		ViewerSettings.stickytoolbar = that.toolbar.issticky
		signalhandler.send("stickychanged");
	}

    function updateSticky()
    {
		if (!that.toolbar.issticky)
		{
            //that.toolbar.$container.find(".Kmintoolsep").show()
			that.toolbar.$stickydiv.find("i").removeClass("fa-circle").addClass("fa-circle-o");
			that.toolbar.hide_addons();
		}
		else
		{
           // that.toolbar.$container.find(".Kmintoolsep").hide()
			that.toolbar.$container.find(".KToolbarSep").removeClass("minimized");
			that.toolbar.$container.find(".KViewPort_tool.caption").removeClass("equalwidth");

			that.toolbar.$stickydiv.find("i").removeClass("fa-circle-o").addClass("fa-circle");
            that.toolbar.show_addons()

		}
	}

    signalhandler.attach("stickychanged",function()
    {
         that.toolbar.issticky = ViewerSettings.stickytoolbar
		 updateSticky()

    })


	if (that.toolbar.issticky)
			that.toolbar.$stickydiv.find("i").removeClass("fa-circle-o").addClass("fa-circle");
	that.toolbar.$stickydiv.click(toggleSticky);

	var types = ['overlay','roi','atlas','fiber','surface','cmat','sticky'];
	for (var k = 0; k < types.length;k++)
	{  
    	that.toolbar[types[k]] = {};
    	that.toolbar[types[k]].$div = $("<div class='KToolbarSep'> </div>").appendTo(that.toolbar.$container);
    	if (types[k] != "sticky")
    	{
    	    that.toolbar[types[k]].$sep = $("<div class='Kmintoolsep'> <i class='fa fa-minus-square-o'></i></div>").appendTo(that.toolbar[types[k]].$div);
    	    that.toolbar[types[k]].$sep.hide();
    	    that.toolbar[types[k]].$sep.on("mousedown",function(t) { return function(){
    	    	var a = that.toolbar[t]
    	    	if (!a.$div.hasClass("minimized"))
    	    	{
					a.$div.addClass("minimized")
					a.$sep.find("i").removeClass("fa-minus-square-o").addClass("fa-plus-square-o")
					that.toolbar.get_addons(a.$div).addClass("KTool_hidden").addClass('KTool_displaynone') 
				    that.toolbar.$container.find(".KViewPort_tool.caption").addClass("equalwidth");

    	    	}
    	    	else
    	    	{
					a.$div.removeClass("minimized")
					a.$sep.find("i").addClass("fa-minus-square-o").removeClass("fa-plus-square-o")  
					if (that.toolbar.issticky)
					{
 	  	  	 		    that.toolbar.get_addons(a.$div).removeClass("KTool_hidden").removeClass('KTool_displaynone') 
					    that.toolbar.$container.find(".KViewPort_tool.caption").removeClass("equalwidth");
					}
					else
					    that.toolbar.$container.find(".KViewPort_tool.caption").addClass("equalwidth");
  	    		
    	    	}
    	    } }(types[k]) );
    	}
	}


    that.toolbar.$info= $("<span class='KViewPort_title'></span>").appendTo(that.$container);

	that.toolbar.$info.attr("draggable",'true');
	that.toolbar.$info.on('mousedown',function(e){e.stopPropagation()})
	.on("dragstart", dragstarter(function() { 
    return { fromViewPort : that.viewport.viewPortID, intent:{viewport:that.viewport.viewPortID}, type:'file', mime: that.contentType, filename: that.currentFilename,  fileID: that.currentFileID}; } ) );	

	that.toolbar.$info.click(function(ev){
		
		ev.stopPropagation();
		ev.preventDefault();
        that.$container.off('mousemove');

   		if (KViewer.zoomedViewport != -1)
        {
           if (!that.viewport.isZoomed())
           {
               KViewer.unZoomViewport();
               that.viewport.zoomViewPort();
           }
           else
                that.viewport.zoomViewPort();
          
        } });


    /** @function */
	that.toolbar.attachhandhover = attachhandhover;
	function attachhandhover($ddiv)
	{
		$ddiv.on('mouseenter',function(){
			$ddiv.find("i").addClass('fa-hand-grab-o');
			$ddiv.find("i").removeClass('fa-hand-paper-o');
		});
		$ddiv.on('mouseleave',function(){
			$ddiv.find("i").removeClass('fa-hand-grab-o');
			$ddiv.find("i").addClass('fa-hand-paper-o');
		});

	}


    /** @function */
	that.toolbar.attach = function($t)
	{
		$t.insertAfter(that.toolbar.$dragdiv);

		return that.toolbar;
	}

    /** @function */

	that.toolbar.append = function(divs,type)
	{
		var $where = that.toolbar[type].$div ;	        
		for (var k = divs.length-1; k >= 0; k--)
			divs[k].appendTo($where);
	//	if (that.toolbar.issticky)
	//	   that.toolbar.show_addons();
		if (that.toolbar[type].$div.find("br").length >2)
		    that.toolbar[type].$sep.show();

	}

	that.toolbar.update = function(type)
	{
 	    if (type == undefined)
 	       t = types;
 	    else
 	       t = [type];
 	    for (var k = 0; k < t.length;k++)
 	    {
 	    	if (that.toolbar[t[k]].$sep != undefined)
 	    	 {
				if (that.toolbar[t[k]].$div.find("br").length >2)
					that.toolbar[t[k]].$sep.show();
				else
					that.toolbar[t[k]].$sep.hide();
 	    	 }
 	    }
	}

	that.toolbar.appendAfter = function(divs,which)
	{
		var $after = that.toolbar.$container.find(which.divs[0]);
		for (var k = 0; k < divs.length; k++)
			divs[k].insertAfter($after);
		if (that.toolbar.issticky)
    		that.toolbar.show_addons();
    	if (which.type != undefined)
			if (that.toolbar[which.type].$div.find("br").length >2)
				that.toolbar[which.type].$sep.show();

	}



    /** @function */
    that.toolbar.show = function()
    {
        that.toolbar.$container.show();
        that.toolbar.show_mainview();
		
        that.toolbar.$container.css('opacity',1);
        var divs = Object.keys(that.toolbar)


    }
     
    /** @function */
    that.toolbar.hide = function()
    {
        that.toolbar.$container.hide();
    }

	that.toolbar.append([that.toolbar.$stickydiv],'sticky');



    // ======================================================================================
	/**  @class 
	   *  @alias KLayoutBar */

	that.layoutbar = {};
	that.layoutbar.opacity = 0.3;
	that.layoutbar.$container = $("<div class='KViewPort_layoutbar'></div>").appendTo(that.$container).click(function(ev){return false;});
	that.layoutbar.$container.on("mouseenter",function()
	{
			that.layoutbar.$container.css('opacity',1);
	});
	that.layoutbar.$container.on("mouseleave",function()
	{
			that.layoutbar.$container.css('opacity',that.layoutbar.opacity);
	});
	that.layoutbar.$zoomin = $("<div class='KViewPort_tool_layout'><i class='fa fa-search-plus fa-1x'></i></div>").appendTo(that.layoutbar.$container);
	that.layoutbar.$zoomout = $("<div class='KViewPort_tool_layout'><i class='fa fa-search-minus fa-1x'></i></div>").appendTo(that.layoutbar.$container);
	/** @function */
	that.layoutbar.attach = function($t)
	{
			$t.insertBefore(that.layoutbar.$zoomin);
			return that.layoutbar;
	}
	/** @function */	
    that.layoutbar.show = function() {that.layoutbar.$container.show();}
	/** @function */    
	that.layoutbar.hide = function() {that.layoutbar.$container.hide();}

	that.layoutbar.$container.css('opacity',that.layoutbar.opacity);


    // ======================================================================================


	
	that.statusbar = {};
	that.statusbar.opacity = 0.3;
	that.statusbar.$container = $("<div class='KViewPort_statusbar'> good morning </div>").appendTo(that.$container).click(function(ev){return false;}).hide();
	that.statusbar.report = function(string)
	{
		var that = this;		
		that.$container.text(string);
		that.$container.fadeIn(300);
		if (that.sid != -1)
			clearTimeout(that.sid);
		that.sid = setTimeout(function(){
			that.$container.fadeOut(500);
			that.sid = -1;			
		},2000);

	}


	that.setInfoText = function(txt)
	{
		if (that.$infobar != undefined)
			$(that.$infobar[0]).html(txt)
	}


    that.takeScreenshot = takeScreenshot
    /** @function */
    function takeScreenshot()
    {
    
	  // find normal or 3D canvas, whichever is visible
	  var $C = that.$container.find(".KViewPort_canvas:visible, .KViewPort_canvas3D:visible");
	  if($C.length > 0)
	  {

		 var blob = dataURItoBlob($C.get(0).toDataURL());
		 var finfo = that.viewport.getCurrentViewer().currentFileinfo;
		 saveScreenShot(blob,finfo,".png",true);		
		 $(".KViewPort_container").removeClass('noBorder');
		
	  }
	  else
	  {
		  KViewer.toggleElementsForScreenShot();
		  $(".KViewPort_container").addClass('noBorder');

		  html2canvas(that.$container).then(function(canvas)
		  {
			 var blob = dataURItoBlob(canvas.toDataURL());
			 var finfo = that.viewport.getCurrentViewer().currentFileinfo;
			 saveScreenShot(blob,finfo);
			 KViewer.toggleElementsForScreenShot();
			 $(".KViewPort_container").removeClass('noBorder');

		  });   
	  }
    }

	that.getCanvas = function()
	{
		  var $C = that.$container.find(".KViewPort_canvas:visible, .KViewPort_canvas3D:visible");
		  if($C.length == 0)
		  {
			console.log("no canvas found.")
			return false;
		  }
		  return $C;
		  //return dataURItoBlob($C.get(0).toDataURL())

	}


    /** @function */
    that.setInnerLayout = setInnerLayout;
    that.setInnerLayout_parent = that.setInnerLayout;  
    function setInnerLayout()
    {
        $ref = viewport.isZoomed()?master.$zoomedPortContainer:viewport.$container;
        that.$container.width($ref.width());
        that.$container.height($ref.height());
    }

    /** @function */    
    that.detachContent = detachContent;
    function detachContent()
    {
      that.$container.detach();
    }

    /** @function */
    that.prepViewer = function (ev,params)
    {
        that.currentFilename = ev.filename;
        that.currentFileinfo = ev.fileinfo;
        that.currentFileID = ev.fileID;
        that.contentType = ev.contentType;
        that.content = ev;
        
        viewport.setCurrentViewer(that);
        if (ev.fileinfo && ev.fileinfo.SubFolder != undefined && ev.fileinfo.SubFolder != "")
    	    that.toolbar.$info.html(ev.fileinfo.patients_id + ev.fileinfo.studies_id + " " + ev.fileinfo.SubFolder+"/"+ev.filename);
    	else
    	    that.toolbar.$info.html(ev.filename);
		if (params && params.hideControls)
        	that.toolbar.hide();
        else
        	that.toolbar.show();
        	
    }

    /** @function */
	that.showControls = function() { 
	    that.toolbar.show(); that.layoutbar.show(); };
    /** @function */
	that.hideControls = function() { that.toolbar.hide(); that.layoutbar.hide(); };

    /** @function */
    that.close = close;
    function close()
    {
    	if (that.currentFileID != undefined)
    	{
			if (that.customClose != undefined)
				that.customClose();
			that.toolbar.hide();
			that.currentFileID = undefined;
			viewport.close();
    	}

    }
 

    that.sigid_close = signalhandler.attach("close",function() { that.close() });

    that.closeUnreferenced = function()
    {
  	   var found = false;
  	   for (var k in KViewer.viewports)
  	   {
  	   	   if (KViewer.viewports[k] != that.viewport)
  	   	     if (KViewer.viewports[k].getCurrentViewer() != undefined
  	   	       && KViewer.viewports[k].getCurrentViewer().currentFileID == that.currentFileID)
  	   	       {
  	   	       	 found = true;
  	   	       }
  	   }
  	   if (!found)
  	   {
  	   	    KViewer.dataManager.delFile(that.currentFileID);
  	   	    KViewer.cacheManager.update();
  	   }
    }


    return that;

}



// ======================================================================================
// ======================================================================================
// ============= VIERWERJS
// ======================================================================================
// ======================================================================================

function KViewerJS(viewport, master)
{
  var that = KPrototypeViewer(viewport, master);

  that.viewerType = 'genViewer';

  var toolbar = that.toolbar;


  var $container = that.$container 
  var $topRow    = that.$topRow;

	
  that.toolbar = toolbar;

  that.scrolltop = 0;
  var $div =  $("<div class='KViewPort_ViewerJS'></div>").appendTo($container);



  that.setContent = setContent;

  function setContent(ev)
  {
	    that.currentFileID = ev.fileID;
	    that.currentFilename = ev.filename;
	
	    viewport.setCurrentViewer(that);
	
		that.prepViewer(ev);

	    if (typeof pdfjsLib == "undefined")		
		    scriptLoader.loadScript('pdf/pdf.min.js', function() { 			
			    scriptLoader.loadScript('pdf/pdf.worker.min.js', function() { 
					renderPdfBlobToIframe(ev.content.buffer,$div[0])
			}) })
		else
		    renderPdfBlobToIframe(ev.content.buffer,$div[0])
	
		  
	    $div.show();
	
	    toolbar.$zoom.show();
	    toolbar.$close.show();
	    toolbar.$info.show()
	
	    setImageLayout();

  }

  that.detachContent = detachContent;
  function detachContent()
  {
  }

  that.setInnerLayout = setImageLayout;
  function setImageLayout()
  {
    $ref = viewport.isZoomed()?master.$zoomedPortContainer:viewport.$container;
    $container.width($ref.width());
    $container.height($ref.height());
	$div.children().css('width',$ref.width()-10)
	if (that.pdf)
		$div.scrollTop(that.scrolltop*($div.children().height()*that.pdf.numPages))

  }

   function close()
    {
    	if (that.currentFileID != undefined)
    	{
			toolbar.$close.hide();
			toolbar.$zoom.hide();

			that.currentFileID = undefined;
			$div.children().remove()
			$div.hide()
			viewport.close();
    	}

    }
    that.close = close;
    signalhandler.attach("close",close);
	var layoutbar = that.layoutbar
	function zoom(fac)
		{
		   var wid = parseInt($div.children().css('width'))
		   var left
		   if ($ref.width()/wid > 1)
		       left = ($ref.width()-wid*fac*Math.floor($ref.width()/wid))/2
		   else
			   left = ($ref.width()-wid*fac)/2
  	       $div.children().css('width',wid*fac)
		   $div.children().css('left',left)
		}
	  layoutbar.$zoomin.on("mousedown", function(e){zoom(1.1)  })	
	  layoutbar.$zoomout.on("mousedown", function(e)  { zoom(1/1.1)   })	
	
    $div.on("scroll",function(e)
    {
       var scrolltop = $div.scrollTop()
	   that.scrolltop = scrolltop/($div.children().height()*that.pdf.numPages)
      
	})
	
	async function renderPdfBlobToIframe(arrayBuffer, $container) {
      $ref = viewport.isZoomed()?master.$zoomedPortContainer:viewport.$container;
		
	  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
	  const pdf = await loadingTask.promise;
	  that.pdf = pdf;
	
	  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
	    const page = await pdf.getPage(pageNum);
	    const viewport = page.getViewport({ scale: 1.5 });
	
	    const canvas = document.createElement('canvas');
	    canvas.width = viewport.width;
	    canvas.height = viewport.height;
	
	    const context = canvas.getContext('2d');
	    const renderContext = {
	      canvasContext: context,
	      viewport: viewport
	    };
	
	    await page.render(renderContext).promise;
		$container.appendChild(canvas);
		$(canvas).width($ref.width()-10)
	  }
		
	}
		
  return that;

}




// ======================================================================================
// ======================================================================================
// ============= KJsonViewer
// ======================================================================================
// ======================================================================================


function KJsonViewer(viewport,master)
{
  /**  @class 
    *  @alias KJsonViewer 
	*  @augments KPrototypeViewer */
  var that = KPrototypeViewer(viewport, master);

  that.viewerType = 'jsonViewer';

  var toolbar = that.toolbar;

	
	
	
  that.unfolded = false;
  function unfold()
  {
			that.unfolded = !that.unfolded
            var labels = $a.find("label");

            var s = $(labels[0]).next()[0].checked;

            for (var k = 0; k < labels.length;k++)
            {
            	if ($(labels[k]).next()[0].checked == s)
            	   $(labels[k]).trigger("click")
            }


  }

  that.getState = function () {
	var state = [];
    var nodes = $a.find("input");
	for ( var k = 0; k < nodes.length;k++)
		state.push(nodes[k].checked)
	  
  	return {fold:state};
  }


  that.setState = function (s) {
    var nodes = $a.find("input");
	for ( var k = 0; k < nodes.length;k++)
		nodes[k].checked = s.fold[k];
	  
  }	

  toolbar.$fold = $("<div class='KViewPort_tool'><i class='fa fa-folder-open fa-1x'></i></div>")
		        .click(unfold);
     
  toolbar.$download = $("<div class='KViewPort_tool'><i class='fa fa-download fa-1x'></i></div>")
        .click(function() { 
            var fname = that.content.filename;
            if (fname.search("\\.json") == -1)
                fname += '.json'
			initiateDownload(that.content.content,  fname);		
         });
     

  toolbar.$save = $("<div class='KViewPort_tool'><i class='fa fa-save fa-1x'></i></div>")
        .click(function() { 
			var myquery = [[]];
			if (that.currentFileID.substr(0,4) == 'meta')
			{
				var psid = that.currentFileID.substr(5).split('#')
				if (psid.length <= 2)
				{
					var sid = "%";
					var obj = json_obj
					if (psid.length == 2)
					{
						 sid = "#"+psid[1];
					}
					else
						 obj = json_obj['STUDIES'];


					myquery[0].push({command:'save_patientinfo_studyinfo' ,json:{piz:psid[0],sid:sid,content:obj }});
					ajaxRequest( myquery, function(e) {
						if (e.json[0].success == 1)
						    alertify.success("studyinfo saved");
						else
                            alertify.error("studyinfo saving failed: " + e.json[0].msg );						

						});
				}




         	}
         	else
         	{
                  var suggested = that.currentFileinfo.Filename;
                  if (that.currentFileinfo.SubFolder != undefined && that.currentFileinfo.SubFolder != "")
                      suggested = that.currentFileinfo.SubFolder + "/" + suggested

				  saveDialog("json",
					  function(name,finfo)
							{ 
								var subfolder;    
								if (name && name.split("/").length > 1)
								{
									var split = name.split("/");
									name = split[split.length-1];
									if (split.length > 1)
									{
										split.pop();
										subfolder = split.join("/");
										finfo.SubFolder = subfolder;
									}

								}
							    uploadJSON(name,json_obj,finfo);  	
                                that.content.content=JSON.stringify(json_obj)
							     

							} ,suggested,that.currentFileinfo) 

  
      					
/*
			  uploadJSON(that.currentFileinfo.Filename,json_obj,{subfolder:that.currentFileinfo.SubFolder});  	 
              that.content.content=JSON.stringify(json_obj)
*/
         	}

         	 });
  toolbar.attach(toolbar.$save);
  toolbar.attach(toolbar.$download);
  toolbar.attach(toolbar.$fold);
  that.layoutbar.$container.hide()

  var json_obj;
  that.getJson = () => json_obj;
	

  var $div =  $("<div class='KViewPort_jsonViewer'></div>").appendTo(that.$container);

  var $a = $("<ol class='csstree'></ol>");
  $div.append($a);


   var editable = true;
  that.setContent = setContent;

  function setContent(params,ev)
  {
	if (ev.obj != undefined)
	  	that.currentFileinfo = ev.obj.fileinfo

    if (ev && ev.intent)
    {
		if ( ev.intent.singleview)
		{
	    	toolbar.$dragdiv.hide();
	    	toolbar.$screenshot.hide()
	    	toolbar.$close.hide();
	    	toolbar.$zoom.hide();
		}
		if ( ev.intent.unfold & !ev.intent.state)
		{
			setTimeout(unfold,0);
		}
		
    }
	  

    var d;
    var str = params.content;
	if (str.content !=undefined)
		d = str.content;
    else
	{
		try { 
	
		    if (params.filename.search("\\.xml")>-1)
			{
				var xml  = xml2js(str);
				d = convxml(xml.elements)
	
				if (params.filename.substring(0,6) == "catROI" | params.filename.substring(0,7) == "catsROI")
					d = convCAT12(d);
			
			}
			else if (params.filename.search("\\.stats")>-1)
	     	{
				d  = parseFSstatAsJSON(str);
	       	}
			else if (params.filename == 'melodic.json')
			{
				 d = JSON.parse(str)
				 for (var k in d)
				 {
					 var s = d[k]
					 s = s.substring(0,s.length-1).split(";")
					 var tmp = s.map((x)=>x.substring(0,x.length-1).split(/[\,]+/).map(parseHexFloat));
					 d[k] =  tmp[0].map((_, colIndex) => tmp.map(row => row[colIndex]));
				 }
				params.content = {content:d};
			//	 if (!KViewer.curveTool.enabled)
			//		  KViewer.curveTool.toggle()
				 KViewer.curveTool.setstate('mode','fMRI')
				 KViewer.curveTool.fmri = d;				
			}
	       	else
	       	{
	    	  var d = sertry(() => JSON.parse(str.replace(/\n/g,"\\n")),
	    	                  () => JSON.parse(str.replace(/\n/g,"\\n").replaceAll('\\"','\"')),
	    	                  () =>  eval('d='+str))
	
	       	}
		} catch(e)
			{
				 KViewer.dataManager.delFile(params.fileID);
				 KViewer.cacheManager.update()
				 alertify.error('Error: The json in this file seems to be corrupt!');
	  			 return false;			
			}	
	}
	if (d == undefined)
	{
		 KViewer.dataManager.delFile(params.fileID);
		 KViewer.cacheManager.update()
		alertify.error('Error: The json in this file seems to be corrupt!');
		return false;
		
	}
		
// this is for the reading form, just extract the formcontent
	if(d.formcontent != undefined)
			d = d.formcontent;

	if (ev && ev.intent && ev.intent.editable != undefined && ev.intent.editable == false)
		editable = false;

	if (!editable)
		toolbar.$save.css('display','none');
	else
		toolbar.$save.css('display','inline-block');
    
	if (ev != undefined && ev.intent != undefined && ev.intent.field != undefined)
	{
		// this is the fileinfo subselector intent
		var keyseq = ev.intent.field.split(".");
		for (var k = 0; k < keyseq.length-1;k++)
		{
			var d_try = d[keyseq[k]];
			if (d_try == undefined)
			{
				d  = d[keyseq[k].substring(keyseq[k].length-4)];  // this compatibility to old seriesnumber stuff
				if (d == undefined)
					break;
			}
			else
		    	d = d_try;
		}
		if (d == undefined)
		{
			d = {Info: "No series information available"};
		}	
		else
		{
			d;
		}
		var dspec = {}
        var sers = Object.keys(d)
        for (var k = 0; k <sers.length;k++)
        {
        	var pat = ev.intent.objinfo.more.Filename.replace("\.nii","")
        	.replace("\.gz","")
        	.replace("\.bvec","")
        	.replace("\.bval","")
        	.replace("\.json","")
        	if (sers[k].search(pat) > -1)
        	{
        		dspec[sers[k]] = d[sers[k]];
        	}
        }
        if (Object.keys(dspec).length > 0)
            d = dspec;


		params.filename = ev.intent.objinfo.more.Filename;		
	}

	if (ev.intent &&  ev.intent.objinfo)
	{
 	  d = $.extend(d,ev.intent.objinfo.more);
	}

  	that.prepViewer(params);

    var id = that.viewport.viewPortID;
    var subid = 0;
    $a.children().remove();

	addChildren(undefined,$a,d,undefined,editable);


	if (ev && ev.intent && ev.intent.state)
		setTimeout(function() { that.setState(ev.intent.state)},100)
	  
	json_obj = d;



	var contextmenu = KContextMenu(
	function(ev) {
		ev.preventDefault();
		ev.stopPropagation();
	   var $menu = $("<ul class='menu_context'>")
	   var $subul = $("<ul >")
	   if (editable)
	   {
		   $menu.append($("<li onchoice='newkey'>insert key</li>"));
		   $menu.append($("<li onchoice='delete'>delete key</li>"));
	   }
	   $menu.append($("<li onchoice='add'>Use as meta index </li>"));


	   return $menu;
	},
	function (str,ev,ev2)
	{
	   if (str)
	   {
			var path = $(ev2.target).parent().attr("path");	   	
			if (str == 'newkey')
			{
			  var def = path + ",";
			  alertify.prompt({msg:'Please give a name'},
			  function(e,val)
					{ 
					   if (e)
					   {
						var sobj = {};
						var obj = sobj;
						index = val.split(".");
						for (var k = 0; k <index.length-1;k++)
						{
							obj[index[k]] = {};
							obj = obj[index[k]];
						}

					   	obj[index[index.length-1]] = "undefined";
						$.extend(true,json_obj,sobj);


						$a.children().remove();
						addChildren(undefined,$a,json_obj,undefined,editable);
					   }
					},def);

			}
			if (str == 'delete')
			{
 				if (path != undefined)
 				{
 					var obj = json_obj;
 					index = path.split(".");
 					for (var k = 0; k <index.length-1;k++)
 						obj = obj[index[k]];
 					delete obj[index[index.length-1]];
					$a.children().remove();
					addChildren(undefined,$a,json_obj,undefined,editable);

 						
 				}
			}
			if (str == 'add')
			{
				var $tr =getOnParentPath( $(ev2.target),function(x) { return x.attr('path') != undefined; });
				var r = getIndexAndLevel($tr.attr('path'));
				var index = r.index;
				var level = r.level;

			  var def;
			  if (index.length>2)
				def = index[index.length-2] + '_' + index[index.length-1];
			  else
				def = index[index.length-1];
			  def = def.replace("\\.","_");

			  var index_sug = index.map((x)=>x.replace(/\./g,"\\.")).join(".");
			 
			  alertify.prompt([{msg:'Create meta index with key sequence:'},{msg:'Give a name for the metaindex (no special chars).<br>Start with "/" to share with all users.' 
							 ,opt:["FLOAT","INT","STRING","MEDIUMTEXT"], optMsg:"Datatype of Index"}],				  
			  function(e,val)
					{ 
					   if (e)
					   {
						 var name = val.str[1];
						 var theindex = val.str[0].split(/(?<!\\)\./).map((x)=>x.replace(/\\./,"."))
						 var shared = false; if(name[0] == "/"){ shared = 1; name = name.substring(1)};

						 if (theindex[0] != "STUDY" && theindex[0] != "PATIENT")
							 theindex[0] = "/" + theindex[0];
						   
						 name = name.replace(/[^\w\s]/gi, '_').replace(/ /g,'_');
						 var type = val.option;
						 if (type == 'STRING')
							type = "CHAR(64)";
						 createMetaIndex_local(name, theindex, type, level, shared);
					   }
					},[index_sug,def]);

				function createMetaIndex_local(name,index,type,level, shared)
				{					


					 var xhr;
					 var pbar = KProgressBar("adding meta index","fa-submit",function(x)
					 {
						xhr.abortPHPprocess();
						refreshButton();
					 },true)


                    var items = patientTableMirror.selectedItems.map((x) => x.replace(/§#/g,"#"))					
					var jsonString = JSON.stringify({name:name,index:index,type:type,level:level, shared:shared,items:items});
					xhr = ajaxRequest('command=addMetaIndex'+'&json=' + jsonString , function(e) {

						var colstate = 'colstate_' + state.viewer.selectionMode[1];
						var tstate = state.table[colstate];
						tstate.viscol.push(true)
						tstate.widths.push(undefined);
						
						state.metaindices = e.metaindices; 
					    pbar.done();
						refreshButton();
					});
				}


			}

	   }
	},true, false);

	function getIndexAndLevel(path)
	{

				var index;
                var level;
                
				if (params.fileinfo.meta)		
				{		
					index = path.split(".");
					level = params.fileinfo.type;
				}
				else
				{
					var subf = params.fileinfo.SubFolder;
					if (subf != "") subf = subf + "/";
					index = [subf + params.filename.replace('.json','')];
					index = index.concat(path.split(/(?<!\\)\./));
					level = 'study';
				}
					
                var name = "test";
                var type = "STRING";
				if (level == 'patient' && index.length == 1)
				{
					name = index[0];
					index = ['PATIENT',index[0]];
				}
				else if (index[0] == 'STUDIES' && index.length == 3)
				{
					name = index[2];
					index = ['STUDY', index[2]];
				}
				else if (level=='study' && index.length == 1)
				{
					name = index[0];
					index = ['STUDY', index[0]];
				}
				else if (index[0] == 'STUDIES')
 			    {
					 index = index.slice(2);
					 level = 'study';
			    }

			    return {index:index,level:level};
	}

    function addChildren($parent, $currentNode, obj,attrarr,editable)
    {
      var theid = id + "_" + subid;
      subid++;
      
      if (attrarr == undefined)
      	attrarr = [];
      var isarray = Array.isArray(obj);
      if (isarray & $.isNumeric(obj[0]) & obj.length>50)
	  {
		 var $tmp = $("<li ></li>")
		 var $info = addChart($tmp,obj,attrarr);
		 var $label = $parent.find("label");
		 $label.text("")
 	     $label.append($info);
		  
		 $currentNode.append($tmp);
 	     if ($parent != undefined)
     	    $parent.append($currentNode);
		 return $currentNode;	  
	  }
		
      var keys = Object.keys(obj);
	  if (!isarray)
	      keys.sort();
      if (keys.length > 1000)
      {
      	 $currentNode.append($("<li class='file'>max children number exceeded!!</li>"));
      	 return $currentNode;
      }
      for (var  k = 0; k < keys.length; k++) {
      	var property = keys[k];
        if (obj.hasOwnProperty(property))
     	{
            var subattr = attrarr.slice(0);
            subattr.push(property);
            if (typeof obj[property] == "object" && obj[property] != undefined)
			{
			  var children_editable = editable;
			  var children = obj[property];
			  if (property.substr(0,6) == "[FORM]" | property.substr(0,5) == "[SQL]" | property.substr(0,6) == "[META]" | property.substr(0,7) == "[DICOM]")
			  {
			  	children_editable = false;
			  	obj[property] = undefined;
			  	delete obj[property];

			  }

			  var $newNode = $("<li><label class="+(children_editable?"'jsoncontenteditable'":"")+ " for='"+theid+'_'+property+"'>"+property+"</label><input type='checkbox' id='"+theid+'_'+property+"' /></li>");
			  //$newNode.append( addChildren($("<ol/>"), obj[property],subattr));
			  setTimeout(function(a,b,c,d,e) { return function() {
			  	addChildren(a,b,c,d,e);
			  } }($newNode,$("<ol/>"),children,subattr,children_editable) ,100);
//			  	addChildren($newNode,$("<ol/>"), obj[property],subattr) 

			  $newNode.on('contextmenu',function(ev){ ev.preventDefault()});
			  $currentNode.append($newNode);
			}
		} 

	  }
      for (var  k = 0; k < keys.length; k++) {
      	var property = keys[k];
	  	
      	
        if (obj.hasOwnProperty(property))
     	{
            var subattr = attrarr.slice(0);
            subattr.push(property);
            if (typeof obj[property] != "object")
            {
              var val = obj[property] ;
              if (val === "")
              	val ="&nbsp";
			  subattr = subattr.map((x) => x.replace(".","\\."))
              $currentNode. append($("<li  path='"+ subattr.join(".") + "' class='file'> <span class='key' >"+property +
               "</span> : <span class="+(editable?"'jsoncontenteditable'":"")+ " contenteditable='"+(editable?"true":"false")+"' >"+val+ "</span></li>")
              .on('contextmenu',function(e){contextmenu(e)})
              .on('dragstart',function(e){
				  var $x = $(e.target);
				  for (var k = 0; k < 3;k++)
				  {
					  if ($x.attr('path') != undefined)
						  break;
					  else
						  $x = $x.parent();
				  }
				  var p = $x.attr('path');
				  var str;
				  if (that.currentFileinfo.SubFolder != "")
					  str = that.currentFileinfo.SubFolder + "/" + that.currentFileinfo.Filename + " " + p;
				  else 
					  str = that.currentFileinfo.Filename + " " + p;
				  e.originalEvent.dataTransfer.setData('text/plain',str);
			   })
              .on('keyup',function(e)
              {
              	var $txt =  $(e.target);
              	var $tr =getOnParentPath( $txt,function(x) { return x.attr('path') != undefined; });
				var index = $tr.attr('path').split(".");
				if (!$txt.hasClass("key"))
				{
					var obj = json_obj;
					for (var k = 0; k < index.length-1;k++)
						obj = obj[index[k]];
					obj[index[index.length-1]] = $txt.text().trim();

				}
				else
				{

				}

              }));
            }
		}
      
     } 

     if ($parent != undefined)
     	$parent.append($currentNode);

     return $currentNode; 
    }

    $div.show();
 
    setInnerLayout();
  }

  function addChart($tmp,obj,attr) {
	    var pts = "";
	    var min = math.min(obj);
	    var max = math.max(obj);
	    var N = obj.length
	    for (var k = 0; k < N;k++)
			{
				pts += k+","+(obj[k]-min)/(max-min)+" "
			}
	    var vb = 'viewBox="0 '+0+' '+N+' '+1+'"'
	  	var poly =[]
	    var wid = 0.02
	    var zero = -min/(max-min);
		poly.push("<polyline points='0,"+zero+" "+N+","+zero+"' style='fill:none;stroke:black;stroke-width:"+wid+"' />");
		poly.push("<polyline points='"+pts+"' style='fill:none;stroke:red;stroke-width:"+wid*5+"' />");
	  
		var str = "<div class=Kjsoninlinechart> <svg preserveAspectRatio='none' "+vb+">" + poly.join(" ") + "</svg></div>"
	    var info = attr[1] + ", #T:"+N + " min:"+niceFormatNumber(min) + " max:"+niceFormatNumber(max)
	    if (that.currentFilename == "melodic.json")
		{
			var tp = attr[1]
		    var info = attr[1] + ", #T:"+N 
			
			info += " expl. var.:"+niceFormatNumber(json_obj.ICstats[0][tp]);
			info += " of tot. var.:"+niceFormatNumber(json_obj.ICstats[1][tp]);
			//info += " s2:"+niceFormatNumber(json_obj.ICstats[2][tp]);
			//info += " s3:"+niceFormatNumber(json_obj.ICstats[3][tp]);
		    info = "<div> "+info+" </div>"
		    var $info = $(info);	    
			$info.click(function(e) {e.preventDefault(); KViewer.setCurrentTimePoint(tp)})
		}
	    else
		{
		    info = "<div> "+info+" </div>"
		    var $info = $(info);	    
		}
	    $tmp.append($(str));
	    return $info

	}
  		
	

  that.setInnerLayout = setInnerLayout;
  function setInnerLayout()
  {
  	that.setInnerLayout_parent();
  //  $div.appendTo(that.$container);
  }

  that.customClose = function()
  {
  	that.closeUnreferenced()
  }


  return that;

}



// ======================================================================================
// ======================================================================================
// ============= KTXTViewer
// ======================================================================================
// ======================================================================================


function KTXTViewer(viewport,master)
{
  /**  @class A small text editor
	   *  @alias KTXTViewer
	   *  @augments KPrototypeViewer */
  var that = KPrototypeViewer(viewport, master);

  that.viewerType = 'txtViewer';
  var toolbar = that.toolbar;


  toolbar.$search = $("<div class='KViewPort_tool'><i class='fa fa-search fa-1x'></i></div>")
        .click(function() { KTXTSearchPanel();  });
  toolbar.attach(toolbar.$search);

  that.$container.addClass("KTxtViewerEditor")
  var $div =  $("<div contenteditable='true' class='KViewPort_txtViewer'></div>").appendTo(that.$container);
  var $textarea =  $("<textarea  class='KTxtViewerEditor'></textarea>").appendTo(that.$container);
  //var $div0 =  $("<div><textarea  class='KTxtViewerEditor'></textarea></div>").appendTo(that.$container);
  //var $div = $div0.find("textarea")

  var editor,codetype;

	
  function getText()
  {
	   var str
	   if (editor != undefined)
		   str = editor.getValue(); 
	   else
		  str = $div.html();
  
	   str = str.replace(/<div>/g, "\n");
	   str = str.replace(/<\/div>/g, "");
	   str = str.replace(/<br>/g, "\n");
	   return str;
  }
  $div.on('keydown',function(e) {
  	if (e.ctrlKey)
  	    return;
    that.toolbar.$save.addClass('notsaved');
  });
  var toolbar = that.toolbar;
  toolbar.$save = $("<div class='KViewPort_tool'><i class='fa fa-save fa-1x'></i></div>")
        .click(function() { 
		  if (that.currentFileID == "WorkstatePostCode")
	      {
		     KViewer.WorkstatePostCode = getText();
 		     that.toolbar.$save.removeClass('notsaved');
			 saveWorkstate(KViewer)
			  
	      }
		  else 
		  {
	           var fobj  = KViewer.dataManager.getFile(that.currentFileID);
	 		   fobj.content =  getText();
	           updateTag(fobj.fileinfo,[], userinfo.username), 		   
	 		   uploadBinary(fobj,{},function(){
	               that.toolbar.$save.removeClass('notsaved'); 		   
	 		   },that.viewport.progressSpinner,false,"usenativePID");
		  }

         });
  toolbar.attach(toolbar.$save);

  toolbar.$play = $("<div class='KViewPort_tool'><i class='fa fa-play fa-1x'></i></div>")
  toolbar.attach( toolbar.$play)
  toolbar.$play.hide();
  toolbar.$play.click(function(){
	  eval("var thefun = " + getText());
	  thefun(()=>1);
  })

	
  function textFromObjectToDiv()
  {	 
	 if (that.currentFileID == "WorkstatePostCode")
	 {
		 KViewer.WorkstatePostCode = getText();
	 }
	 else
	 {
	     var fobj  = KViewer.dataManager.getFile(that.currentFileID);   
	     if (fobj != undefined)
		 {
			fobj.content = getText()
		 }
	 }
	 
  }
  function textFromDivToObject()
  {
	 if (that.currentFileID == "WorkstatePostCode")
	 {
		 if (KViewer.WorkstatePostCode == undefined)
			 editor.setValue("function(callback)\n{\n  alertify.success('run');\n  callback()\n}")
		 else
			 editor.setValue(KViewer.WorkstatePostCode)
	 }
	 else
	 {
	     var fobj  = KViewer.dataManager.getFile(that.currentFileID);   
		 if (editor != undefined)
			 editor.setValue(fobj.content); 	
		 else
		     $div[0].innerHTML = ((fobj.content)); 	
		 
	 }
	 if (editor != undefined)
	     editor.refresh();
  }

  $div.on("blur",textFromObjectToDiv);
  $div.on("focus",textFromDivToObject);

  that.layoutbar.$container.hide();

  that.setContent = setContent;
  function setContent(ev,p)
  {

    if (p && p.intent && p.intent.singleview)
    {
    	toolbar.$dragdiv.hide();
    	toolbar.$screenshot.hide()
    	toolbar.$close.hide();
    	toolbar.$zoom.hide();
    }
  	
  	that.prepViewer(ev);  	

	codetype = undefined;
	if (that.currentFileID == "WorkstatePostCode")
	    codetype = "javascript";
	if (that.currentFilename.search("\\.py")>-1)
		codetype = "python"
	if (that.currentFilename.search("\\.m")>-1)
		codetype = "octave"
	  
	if (codetype != undefined)
	{
		$textarea.show();
		$div.hide()
		editor = CodeMirror.fromTextArea($textarea.get(0), {
			lineNumbers: true,
			lineWrapping: true,
			mode: codetype,
			matchBrackets: true,
			extraKeys: {
				Tab: betterTab
			},
			height: "100px",
		});
        editor.on('change', function(e) {
			  	if (e.ctrlKey)
			  	    return;
			    that.toolbar.$save.addClass('notsaved');
                })
 	}
	else
	{
		$textarea.hide();
		$div.show()
		
	}
	  
    textFromDivToObject();
    if (ev.modified == true)
        that.toolbar.$save.addClass('notsaved');
    else
        that.toolbar.$save.removeClass('notsaved');

    if (that.currentFileID == "WorkstatePostCode")
	{  
	  that.toolbar.$play.show()
	}	  
    setInnerLayout();

    if(state.txtsearchpanel != undefined)
    {
    	var txt = KTXTSearchPanel_runSearch($div.html())
    	$div.html(txt)
    	$div.attr("contenteditable", false)
    	$div.css('user-select', 'text')
    	$div.addClass("KViewPort_txtViewer_txtsearch")
    }

  }

  that.setInnerLayout = setInnerLayout;
  function setInnerLayout()
  {
  	that.setInnerLayout_parent();  
	
	if (editor)
	{
		if (editor.cid != undefined)
			clearTimeout(editor.cid)
		editor.cid = setTimeout(function() {editor.refresh(); editor.cid = undefined;},100);
	}
  }

  that.customClose = function()
  {
  	textFromObjectToDiv();
  	if (!that.toolbar.$save.hasClass("notsaved"))
  	{
  	    that.closeUnreferenced()
  	}
  	else
  	    that.content.modified = true;
  }

  return that;

}






// ======================================================================================
// ======================================================================================
// ============= KBmpViewer
// ======================================================================================
// ======================================================================================




function KBmpViewer(viewport, master)
{ 
  /**  @class A simple Bitmap viewer work jpgs,bmps,pngs,etc..
	   *  @alias KBmpViewer 
	   *  @augments KPrototypeViewer */
  var that = KPrototypeViewer(viewport, master);
  that.viewerType = 'bmpViewer';

  var layoutbar = that.layoutbar;
  layoutbar.$zoomin.on("mousedown", function(e)
   {
	zoom(1,5);
	e.stopPropagation();
	e.preventDefault();
   })

  layoutbar.$zoomout.on("mousedown", function(e)
   {
	zoom(-1,5);
	e.stopPropagation();
	e.preventDefault();
   })

	//************* better slidezoomer **********
   layoutbar.$slidezoom   = $("<span class='KViewPort_tool_layout'> <i class='fa fa-search fa-1x'></i> </span>");
   layoutbar.attach(layoutbar.$slidezoom)
   attachMouseSlider(layoutbar.$slidezoom, 
        {
            mousedown: function(ev)
            { 
            ev.stopPropagation();
                return { startzoomFac: that.zoom} 
            }, 
            mousemove:function(ev,dx,dy,mousedownvar, lastdx, lastdy) 
            {
            	ev.stopPropagation();
				that.zoom  = mousedownvar.startzoomFac - dy;
				setInnerLayout(1);
                return  true;

            }, 
            mouseup: function(){ } 
        });
    layoutbar.$resetzoom  = $("<span class='KViewPort_tool_layout'> <i class='fa fa-reply fa-1x'></i> </span>");
    layoutbar.$resetzoom.mousedown(function(ev){ that.zoom = 1; setInnerLayout();  ev.stopPropagation();    })
    layoutbar.attach(layoutbar.$resetzoom);
	layoutbar.$zoomin.hide();
	layoutbar.$zoomout.hide();



    that.toolbar.$tonii = $("<div class='KViewPort_tool'><i class='fa fa-1x'>nii</i></div>")
					 .on('mousedown',function(e){e.stopPropagation()})
                     .click(function()
				     {
						    function getImageBuffer(img) {
						            // Create a canvas element
						            const canvas = document.createElement('canvas');
						            const ctx = canvas.getContext('2d');
						
						            // Set canvas dimensions to match the image
						            canvas.width = img.naturalWidth;
						            canvas.height = img.naturalHeight;
						
						            // Draw the image on the canvas
						            ctx.drawImage(img, 0, 0);
						
									var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
						            var data = imageData.data;
						
						            return {buf: data, size: [canvas.width, canvas.height]}
							}	
			
						    var name = that.currentFilename.split(/\./)[0];
						    alertify.prompt([{msg:'Pixel sizes'},
										   {msg:'Name:'}],
						    function(e,val)
								{ 
								   if (e)
								   {									 
										var im = getImageBuffer($img[0])
									    var psz = val[0].split(",").map(parseFloat)
									    var edges = math.eye(4);
									    edges._data[0][0] = psz[0];
									    edges._data[1][1] = psz[1];
										var res = createNifti({edges:edges,voxSize:[psz[0],psz[1],1],sizes:[im.size[0],im.size[1],1]},val[1],'uint16',1,{})
									    for (var k = 0; k < im.size[0]*im.size[1]; k++)
											{
												res.data[im.size[0]*im.size[1]-k] = im.buf[4*k]+im.buf[4*k+1]+im.buf[4*k+2];
											}

								   }
								},['1,1',name])
				      }
						
                     ).appendTooltip("to nifti")
    that.toolbar.attach(that.toolbar.$tonii)
    var $img =  $("<img  class='KViewPort_img'></img>").appendTo(that.$container);
    $img.on('dragstart',function(e) { 
    e.preventDefault() });
    $img.click(function() {
  	 
		  	if (!that.moved)
		  	{
				if (viewport.viewPortID != KViewer.zoomedViewport)
		  			KViewer.unZoomViewport();
				viewport.zoomViewPort();  		
		
		  		that.$container.off('mousemove mouseup');
		  	}
    });

    $img.on('load', function()
    {  
   	     
    	  setInnerLayout();
          //$img.fadeIn(200);
		  $img.show();

		  var icontainer = that.$container[0];
		  if ( icontainer.addEventListener) {
			  icontainer.addEventListener("mousewheel", MouseWheelHandler, false);// Firefox
			  icontainer.addEventListener("DOMMouseScroll", MouseWheelHandler, false);    
		   }
		  else
			  icontainer.attachEvent("onmousewheel", MouseWheelHandler);
	
		  that.$container.on('mousedown',MouseButtonHandler);
    });

    that.setContent = setContent;

	function setContent(ev)
	{
	    //$img.detach();
	 	$img.hide();
	
		that.prepViewer(ev);
	
	    that.zoom = 1;
	    that.offX =0;
	    that.offY =0;
	
		if( ev.contentType == 'nii')
		{
			// ************ convert a single slice RGB nifti to png using a canvas **********
			var canvas = document.createElement('canvas');
			var ctx = canvas.getContext('2d');
			var imgData=ctx.createImageData(ev.content.sizes[0],ev.content.sizes[1]);
			canvas.width = ev.content.sizes[0];
			canvas.height = ev.content.sizes[1];
			for (var k=0;k<ev.content.data.length/3;k++)
			{
				imgData.data[4*k+0] =ev.content.data[3*k+0];
				imgData.data[4*k+1] =ev.content.data[3*k+1];
				imgData.data[4*k+2] =ev.content.data[3*k+2];
				imgData.data[4*k+3] =255;
			}
			ctx.putImageData(imgData,0,0);
			var imageUrl = canvas.toDataURL();
		}
		else
		{
		    var blob = new Blob( [ ev.content ], { type: "image" } );
	    	var urlCreator = window.URL || window.webkitURL;
	    	var imageUrl = urlCreator.createObjectURL( blob );   
		}
	    
	 	
	    $img.attr('src',imageUrl); 
		that.currentFileID = ev.fileID;
	
	  }
	
	  function zoom(amount,delta)
	  {
	  		var fac = 1;
			if (amount > 0)
			   fac +=0.01*delta;
			else
			   fac -=0.01*delta;
			that.zoom *= fac;
			setInnerLayout();
	
	  }
	
	
	  var MouseWheelHandler = function(e)
	  {
		  var amount = (e.wheelDelta || -e.detail);
		  if(e.ctrlKey)
		  {
			e.preventDefault();
			zoom(amount,1);
		  }
	
	  }
	
	  var MouseButtonHandler = function(e)
	  {
	 	  var X = that.offX - e.clientX; 
	 	  var Y = that.offY - e.clientY; 
	      that.moved = false;
	  	 
		 // if (e.ctrlKey)
		  {
		  	 e.preventDefault();
			 that.$container.on('mousemove', function(ev)
			 {
				 that.offX = X + ev.clientX; 
				 that.offY = Y + ev.clientY; 
				 that.moved = true;
				 setInnerLayout();
				 that.$container.on('mouseup', function()
				 {
				 	that.$container.off('mousemove mouseup');
				 });
	
			 });
	
	
		  }	  
	
	
	  	
	  }
	
	
	  that.setInnerLayout = setInnerLayout;
	  function setInnerLayout( force)
	  {
	  	    that.setInnerLayout_parent();
	  	
			if (that.currentFileID != undefined)
			{
		
	
			  var hei = $img.get(0).naturalHeight;
			  var wid = $img.get(0).naturalWidth;
			  //console.log(force);
			  
			  var   fac = that.$container[0].offsetWidth/wid*that.zoom;
	 		  if ( that.$container[0].offsetHeight - hei*fac <= 0)
	 		     fac = that.$container[0].offsetHeight/hei*that.zoom;
	
			  wid = wid *fac;
			  hei = hei * fac;
			  var widoffs = (that.$container[0].offsetWidth - wid)/2;
			  var heioffs = (that.$container[0].offsetHeight - hei)/2;
	
			  widoffs += that.offX;
			  heioffs += that.offY;
			  //console.log(widoffs);
			  $img.css({height: math.round(hei) -2 + 'px', width:  math.round(wid)-2 + 'px', top: math.round(heioffs) + 'px', left:  math.round(widoffs) + 'px'});
			  //$img.appendTo(that.$container);
			}
	  	
	  }
	

	signalhandler.attach("updateFilelink",function(ev)
		{
			if(ev.id == that.currentFileID)
			{
				var tfile = KViewer.dataManager.getFile(ev.id);
				setContent(tfile);
			}
		}
	);


  return that;
}





$.fn.textWidth = function(text, font) {
    if (!$.fn.textWidth.fakeEl) $.fn.textWidth.fakeEl = $('<span>').hide().appendTo(document.body);
    $.fn.textWidth.fakeEl.text(text || this.val() || this.text()).css('font', font || this.css('font'));
    return $.fn.textWidth.fakeEl.width();
};

