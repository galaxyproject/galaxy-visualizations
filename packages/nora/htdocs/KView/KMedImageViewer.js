



// ======================================================================================
// ======================================================================================
// ============= KMedViewer
// ======================================================================================
// ======================================================================================



function KMedViewer(viewport, master)
{

    
    /**  @class 	   
     *  @alias KMedViewer */
    var that = KPrototypeViewer(viewport, master);
    that.viewerType = 'medViewer';
    that.type = 'mainview';

    var $container = that.$container;
    var $topRow = that.$topRow;
    var toolbar = that.toolbar;

    toolbar.$info.hide();

    var $canvascontainer = $("<div class='KViewPort_canvascontainer'></div>").appendTo($container);
    that.$canvascontainer = $canvascontainer;

    // attach the histogram
    that.histoManagercnt = 0;
    var histoManager = createHistoManager(that);
    /** @type {KHistoManager} 
     */
    that.transfactor = 1;
    that.histoManager = histoManager;
    that.visible = true;
    that.isFlatMap = false;

    histoManager.blending = undefined;
    histoManager.posnegsym = undefined;
    histoManager.blocky = undefined;
    histoManager.onclimchange = function(ev)
    {
        sliceDrawUpdateNeeded = true;
        histoManager.clim_manually_modified = true;
        signalhandler.send("climChange", {
            id: that.currentFileID,
            val: histoManager.clim,            
            ev: ev
        });
    }



    var infomenu = function(_that) {
        return KContextMenu(function() {
            var nii = that.nii;
            var msz;
            if (nii.sizes.length > 3)
                msz = "matrix: " + nii.sizes[0].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[1].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[2].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[3].toFixed(0);
            else
                msz = "matrix: " + nii.sizes[0].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[1].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[2].toFixed(0);

            if (nii.currentTimePoint.t != 0)
                msz += "  (t:" + (nii.currentTimePoint.t + 1) + ")";

            if (that.currentFileinfo)
                var psid = that.currentFileinfo.patients_id + " " + that.currentFileinfo.studies_id;
            else
                var psid = "localfile";

            msz = that.currentFilename + " <br> ID: " + psid +
            "<br>" + msz + "<br>voxsize: " +
            nii.voxSize[0].toFixed(1) + '&nbsp;&nbsp;' + nii.voxSize[1].toFixed(1) + '&nbsp;&nbsp;' + nii.voxSize[2].toFixed(1)


            return $("<ul class='menu_context'>").append($("<li >" + msz + " </li>"));

        }, function(str, ev) {})
    }(that);


    that.switchToMosaic = function()
    {
          if (gl_enabled)
                    toggle3D();
            that.mosaicview.active = true;
            setCanvasLayout();
            drawSlice();
    }

    that.switchToSingle= function()
    {

            if (gl_enabled)
                    toggle3D();
                if (that.mosaicview.active)
                    that.mosaicview.active = false;
                setCanvasLayout();
                if (!that.mosaicview.active)
                    drawSlice();
    }

    that.switchTo3D = function(callback)
    {
                if (that.mosaicview.active)
                    that.mosaicview.active = false;
                if (!gl_enabled)
                    toggle3D(undefined,callback);
                else
                {
                    setCanvasLayout();
                    drawSlice();
                }
    }

    that.toggle = function(e)
    {
        var vis = !that.visible;
        if (!e.shiftKey)
        {
            master.iterateMedViewers(function(m)
            {
                    if (that.currentFileID == m.currentFileID)
                    {
                        m.setVisibility(vis)
                    }

            });            
        }
        else
            that.setVisibility(vis)
    }

    that.setVisibility = function(visible)
        {
            if (!visible)
            {
                that.visible = false;
                toolbar.$eye.css('color', 'red');
            }
            else
            {
                that.visible = true;
                toolbar.$eye.css('color', '');
            }
            that.drawSlice({
                mosaicdraw: true
            });
        }




    that.viewContextMenu = new KContextMenu(
    function() {
        var $menu = $("<ul class='menu_context'>");
        var name = ['Sagittal', 'Coronal', 'Transversal'];

        $menu.append($("<hr width='100%'> "));
        $menu.append($("<span> &nbsp View</span>"));
        $menu.append($("<hr width='100%'> "));
        var sel = (!gl_enabled && !that.mosaicview.active) ? 'check-' : '';
        $menu.append($("<li  onchoice='single' > <i  onchoice='single' class='fa fa-" + sel + "circle-o'></i><i class='leftaligned fa fa-user'></i>   Single slice   </li>"));
        var sel = that.mosaicview.active ? 'check-' : '';
        $menu.append($("<li  onchoice='mosaic' > <i  onchoice='mosaic' class='fa fa-" + sel + "circle-o'></i>  <i class='leftaligned fa fa-th'></i>   Mosaic  </li>"));
        var sel = gl_enabled ? 'check-' : '';
        
        if (typeof KMedImg3D != "undefined")
            $menu.append($("<li  onchoice='3dview' >  <i  onchoice='3dview' class='fa fa-" + sel + "circle-o'></i>  <i class='leftaligned fa fa-cube'></i>   3D view </li>"));

     //   $menu.append($("<li  onchoice='curveview' >  <i  onchoice='curveview' class='fa fa-" + sel + "circle-o'></i>  <i class='leftaligned fa fa-line-chart'></i>   Curve view </li>"));

        $menu.append($("<hr width='100%'> "));
        var sel = worldLockedToMaster ? 'check-' : '';
        $menu.append($("<li  onchoice='lock' > Global coordinates<i  onchoice='lock' class='fa fa-" + sel + "square-o'></i> </li>"));


         var permstr = "<li  onchoice='...' >Permutation<i  onchoice='lock' class='fa fa-caret-right'></i> <ul>" ;
         for (var k = 0; k < presetForm_viewer_permorder.choices.length;k++ )
         {
             var sel = (that.nii.reordering == presetForm_viewer_permorder.ids[k]) ? 'check-' : '';
             permstr += " <li  onchoice='permorder_"+presetForm_viewer_permorder.ids[k]+"' >"+ presetForm_viewer_permorder.choices[k] + "<i  onchoice='lock' class='fa fa-"+sel+"square-o'></i> </li> "
         }
         permstr += "</ul></li>";
         $menu.append($(permstr));

        if (!gl_enabled)
        {
            $menu.append($("<hr width='100%'> "));
            $menu.append($("<span> &nbsp Slicing</span>"));
            $menu.append($("<hr width='100%'> "));
            var perm = [0, 1, 2];
            //[viewer.nii.permutationOrder[0],viewer.nii.permutationOrder[1],viewer.nii.permutationOrder[2]];
            perm[-1] = -1;
            for (var k = 0; k < 3; k++)
            {
                var sel = '';
//                 if (slicingDimOfWorld == that.nii.permutationOrder[k])
//                     sel = 'check-';
                if (slicingDimOfWorld == k)
                    sel = 'check-';

                $menu.append($("<li  onchoice='vis_" + k + "' > " + name[k] + "  <i  onchoice='vis_" + k + "' class='fa fa-" + sel + "circle-o'></i> </li>"));


            }
        }

        return $menu;
    }
    ,function(str, ev)
    {
        if (str != undefined)
        {
            if (str.search("vis") != -1)
            {
                setSlicingDimOfWorld(parseInt(str.substring(4)));
            }
            else if (str == "single")
            {
                that.switchToSingle();
            }
            else if (str == "mosaic")
            {
                that.switchToMosaic();
            }
            else if (str == "3dview")
            {

                that.switchTo3D();

            }
            else if (str == "curveview")
            {
                if (that.mosaicview.active)
                    that.mosaicview.active = false;
                if (gl_enabled)
                    toggle3D();
                
                KMedImgCurve( that );    

            }
            else if (str == 'lock')
            {
                changeWorldLock();
//                 if (worldLockedToMaster)
//                     customPoint = math.matrix(getWorldPosition());
//                 worldLockedToMaster = !worldLockedToMaster;
//                 drawSlice({
//                     mosaicdraw: true
//                 });
            }
            else if (str.substring(0,10) == 'permorder_')
            {
                var id = str.substring(10);
                that.niiOriginal.applyReordering(id);
                signalhandler.send("updateImage",{id:that.currentFileID});
            }
        }
    }
    ,undefined,false);


    function KIcon(name,$div,style)
    {
        if (style == undefined)
            style = "";

        var $icon;
        if (name == "planecube")
        {
            style = style = style +"stroke:lightgray;stroke-width:1";
            $icon = [];
            $icon[2] = $("<div> <svg style='' height=12 width=12>"+
            " <polygon points='1,3 1,9 6,11 6,5' style='fill:none;"+style+"' />"+
            " <polygon points='11,3 11,9 6,11 6,5' style='fill:none;"+style+"' />"+
            " <polygon points='1,3 6,5 11,3 6,1' style='fill:yellow;"+style+"' />"+
            +"</svg> </div>");
            $icon[1] = $("<div> <svg style='' height=12 width=12>"+
            " <polygon points='1,3 1,9 6,11 6,5' style='fill:none;"+style+"' />"+
            " <polygon points='11,3 11,9 6,11 6,5' style='fill:yellow;"+style+"' />"+
            " <polygon points='1,3 6,5 11,3 6,1' style='fill:none;"+style+"' />"+
            +"</svg> </div>");
            $icon[0] = $("<div> <svg style='' height=12 width=12>"+
            " <polygon points='1,3 1,9 6,11 6,5' style='fill:yellow;"+style+"' />"+
            " <polygon points='11,3 11,9 6,11 6,5' style='fill:none;"+style+"' />"+
            " <polygon points='1,3 6,5 11,3 6,1' style='fill:none;"+style+"' />"+
            +"</svg> </div>");
        }

        $div.append($icon);

        return $icon;
    }




    toolbar.$cmapReset = $("<div class='KViewPort_tool KViewPort_tool_cmapReset'><i class='fa fa-reply fa-1x'></i></div>").click(function() {
        resetColorMapLims();
    }).appendTooltip("resetclims")
    toolbar.$cmap = $("<div class='KViewPort_tool KViewPort_tool_cmap'><i class='fa fa-empty fa-1x'>&nbsp&nbsp&nbsp&nbsp</i></div>").click(histoManager.cmapSelectorMenu).appendTooltip("changecolormap")
    toolbar.$quiver = $("<div  class='KViewPort_tool'>  <i class='fa fa-code-fork fa-1x'> </div>").click(function(e) {
        quiver.menu(e,that)
    }).appendTooltip("quiverprops")
    that.quiverdiv =  toolbar.$quiver
    toolbar.$info = $("<div  class='KViewPort_tool'>  <i class='fa fa-info-circle fa-1x'> </div>").click(infomenu);
    toolbar.$lock = $("<div  class='KViewPort_tool'>  <i class='fa fa-lock fa-1x'> </div>").click(changeWorldLock);
    toolbar.$view = $("<div  class='KViewPort_tool'>  <i class='fa fa-photo fa-1x'> </div>").click(that.viewContextMenu);
    toolbar.$eye = $("<div  class='KViewPort_tool'>  <i class='fa fa-eye fa-1x'> </div>").click(that.toggle);
    toolbar.$createIso = $("<div  class='KViewPort_tool'>  <i class='fa fa-play fa-1x'> </div>");
    
   

    toolbar.$toggle3D = $("<div class='KViewPort_tool KViewPort_tool_toggle3D'><i class='fa fa-1x'><span>3D</span></i></div>").click(function() {
        toggle3D()
    }).appendTooltip("switchto3d");
    toolbar.$slicingDim = $("<div class='KViewPort_tool KViewPort_tool_slicingDim'></div>").click(toggleSlicingDim).appendTooltip("changeslicing")
    toolbar.$sliceCubes = KIcon('planecube',toolbar.$slicingDim);

    toolbar.attach(toolbar.$cmapReset).attach(toolbar.$cmap).attach(toolbar.$info).attach(toolbar.$quiver).attach(toolbar.$toggle3D).attach(toolbar.$lock).attach(toolbar.$view).attach(toolbar.$eye).attach(toolbar.$slicingDim);

    var layoutbar = that.layoutbar;
    layoutbar.$slicing = $("<div class='KViewPort_tool_layout'><i class='fa  fa-1x'></i></div>").click(toggleSlicingDim).appendTooltip("changeslicing")

    if (typeof KMedImg3D != "undefined")
    {

        layoutbar.$shortcut3d   = $("<span class='KViewPort_tool_layout layout3dshortcut'> 3D</span>");

        layoutbar.$shortcut3d.click(function()
        {
           toggle3D(); 
        });
    }
    layoutbar.$sliceCubes = KIcon('planecube',layoutbar.$slicing);
    layoutbar.$center = $("<div class='KViewPort_tool_layout'><i class='fa fa-dot-circle-o fa-1x'></i></div>").click(
            function() { signalhandler.send("centralize",{viewer:that}); }
    ).appendTooltip("centerview");

    layoutbar.attach(layoutbar.$slicing);
    if (typeof KMedImg3D != "undefined")
        layoutbar.attach(layoutbar.$shortcut3d);
    
    // ******** slide slices and slide zoom
    layoutbar.$slideslices = $("<span class='KViewPort_tool_layout'> <i class='fa fa-unsorted fa-1x'></i> </span>");
    layoutbar.$slidezoom   = $("<span class='KViewPort_tool_layout'> <i class='fa fa-search fa-1x'></i> </span>");

    // slice slider
    attachMouseSlider(layoutbar.$slideslices, {
            mousedown: function(){ return { startval: currentSlice, startval_percent: currentSlice / (that.nii.sizes[slicingDimOfArray]-1) } } , 
            mousemove:function(ev,dx,dy,mousedownvar) {  
                return that.setSlicePos(slicingDimOfArray, mousedownvar.startval - that.nii.arrayReadDirection[slicingDimOfArray]*dy*(that.nii.sizes[slicingDimOfArray]-1) ) }, 
            mouseup: function(){ } 
            });
    
    // zoom slider
    attachMouseSlider(layoutbar.$slidezoom, 
        {
            mousedown: function()
            {         
                return { startzoomFac: that.zoomFac, startBox: that.mosaicview.clipratio,
                       currentpos: getCanvasCoordinates(getWorldPosition()),
                       } 
            }, 
            mousemove:function(ev,dx,dy,mousedownvar, lastdx, lastdy) 
            {
                if (gl_enabled)
                {
                    var zoominc = 1 - lastdy*0.001;
                    var maxex = that.computeMaxExtentFac()

                    that.gl.camera.inertialRadiusOffset -= maxex * (1 - zoominc);
                    if (isNaN(that.gl.camera.inertialRadiusOffset))
                        that.gl.camera.inertialRadiusOffset = 1;
                    that.gl.sync3DViews(that.gl.camera.inertialAlphaOffset,that.gl.camera.inertialBetaOffset,
                        that.gl.camera.inertialPanningX,that.gl.camera.inertialPanningY,that.gl.camera.inertialRadiusOffset );

                    that.gl.activateRenderLoop();
                    setTimeout(that.gl.setQuality,350);
                }
                else if (that.mosaicview.active)
                {
                    var sbox = mousedownvar.startBox;
                    var cpos = mousedownvar.currentpos;
                    var zoomy = 1+0.1*dy;
                    sbox[0] = (sbox[0]-cpos.x_norm)*zoomy + cpos.x_norm;
                    sbox[2] = (sbox[2]-cpos.x_norm)*zoomy + cpos.x_norm;
                    sbox[1] = (sbox[1]-cpos.y_norm)*zoomy + cpos.y_norm;
                    sbox[3] = (sbox[3]-cpos.y_norm)*zoomy + cpos.y_norm;
                    if (sbox[0]<0) sbox[0] = 0;
                    if (sbox[1]<0) sbox[1] = 0;
                    if (sbox[2]>1) sbox[2] = 1;
                    if (sbox[3]>1) sbox[3] = 1;
                    if (sbox[2]-sbox[0] < 0.0001 | sbox[3]-sbox[1]  < 0.0001 )
                     {
                        sbox = [0,0,1,1];
                        alertify.error("are you nuts")
                    }
                    that.mosaicview.clipratio = sbox;
  
                    if (KViewer.mainViewport != -1)
                        signalhandler.send("mosaic_changelayout",that.mosaicview);
                    else
                    { 
                        setCanvasLayout();
                        drawHairCross();
                    }             
                }
                else
                {
                    var zoominc = 1 - lastdy*0.01;
                    $(".markerpoint,.markerruler").css('display','none')
                    if (worldLockedToMaster & master.globalCoordinates &
                        !ev.shiftKey & !that.isFlatMap)
                    {                    
                        signalhandler.send("setZoom", zoominc );
                        signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger);
                    }
                    else
                    {
                        setZoom(zoominc);
                        signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger); 
                    }

                }
                return  true;

            }, 
            mouseup: function(){ 

                signalhandler.send("positionChange", {},that.positionChanger); 
                
            } 
        },
        {hideCurrentval:true}
        );

    layoutbar.attach(layoutbar.$slideslices)

    layoutbar.attach(layoutbar.$center);

    layoutbar.attach(layoutbar.$slidezoom)

    layoutbar.$resetzoom  = $("<span class='KViewPort_tool_layout'> <i class='fa fa-reply fa-1x'></i> </span>");
    layoutbar.$resetzoom.mousedown(function(ev){ 
            var p = niiOriginal.centerWorld
            if (that.isFlatMap)
            {
               customPoint = p;
               p = mapFlatMapCoordinate(p)
            }
            KViewer.resetCrossHair(ev,p) 

         })
    layoutbar.attach(layoutbar.$resetzoom)


    layoutbar.$zoomin.on("mousedown", function(e)
    {
        if (layoutbar.$zoomin.iid != -1)
            clearInterval(layoutbar.$zoomin.iid);
        var maxex = that.computeMaxExtentFac()
        layoutbar.$zoomin.fac = 1.002;
        if (gl_enabled)
        {
            layoutbar.$zoomin.iid = setInterval(function()
            {
                that.gl.camera.inertialRadiusOffset -= maxex * (1 - layoutbar.$zoomin.fac);
                if (isNaN(that.gl.camera.inertialRadiusOffset))
                    that.gl.camera.inertialRadiusOffset = 1;


                that.gl.activateRenderLoop();
                that.gl.setQuality()
                
            }, 0);
        }
        else if (that.mosaicview.active)
        {
            var amount = 1;
            that.mosaicview.zoom += ((amount > 0) ? -1 : 1) * 0.3 * scrollSpeed;
            if (that.mosaicview.zoom > 1)
                that.mosaicview.zoom = 1;
            setCanvasLayout();
            drawHairCross();
        }
        else {
            layoutbar.$zoomin.iid = setInterval(function()
            {
               $(".markerpoint,.markerruler").css('display','none')
                 signalhandler.send("setZoom", layoutbar.$zoomin.fac);
                signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger);
                if (layoutbar.$zoomin.fac < 1.01)
                    layoutbar.$zoomin.fac += 0.0002;
            }, 0);
        }
    });
    layoutbar.$zoomin.on("mouseup mouseleave", function(e)
    {
        clearInterval(layoutbar.$zoomin.iid);
        layoutbar.$zoomin.iid = -1;
    });
    layoutbar.$zoomout.on("mousedown", function(e)
    {
        if (layoutbar.$zoomout.iid != -1)
            clearInterval(layoutbar.$zoomin.iid);        
        var maxex = that.computeMaxExtentFac()        
        layoutbar.$zoomout.fac = 0.998;
        if (gl_enabled)
        {
            layoutbar.$zoomout.iid = setInterval(function()
            {
                that.gl.camera.inertialRadiusOffset += maxex * (1 - layoutbar.$zoomin.fac);
                if (isNaN(that.gl.camera.inertialRadiusOffset))
                    that.gl.camera.inertialRadiusOffset = 1;
                
                that.gl.activateRenderLoop();
                that.gl.setQuality()
            }, 0);
        }
        else if (that.mosaicview.active)
        {
            var amount = -1;
            that.mosaicview.zoom += ((amount > 0) ? -1 : 1) * 0.3 * scrollSpeed;
            if (that.mosaicview.zoom > 1)
                that.mosaicview.zoom = 1;
            if (KViewer.mainViewport != -1)
                signalhandler.send("mosaic_changelayout",that.mosaicview);
            else
            { 
                setCanvasLayout();
                drawHairCross();
            }                      
        }
        else {
            layoutbar.$zoomout.iid = setInterval(function()
            {
                    $(".markerpoint,.markerruler").css('display','none')                
                signalhandler.send("setZoom", layoutbar.$zoomout.fac);
                signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger);                
                if (layoutbar.$zoomout.fac > 0.99)
                    layoutbar.$zoomout.fac -= 0.0002;
            }, 0);
        }
    });
    layoutbar.$zoomout.on("mouseup mouseleave", function(e)
    {
        clearInterval(layoutbar.$zoomout.iid);
    });

    layoutbar.$zoomin.hide();
    layoutbar.$zoomout.hide();

    
    layoutbar.$moszoomin = $("<span class='KViewPort_tool_layout'> <i class='fa fa-plus'></i> </span>").hide().click(
    function(e)
    {
        var amount = -1;
        that.mosaicview.nx_cont += ((amount > 0) ? -1 : 1);
        if (that.mosaicview.nx_cont < 2)
            that.mosaicview.nx_cont = 2;
        that.mosaicview.nx = Math.round(that.mosaicview.nx_cont);
        if (KViewer.mainViewport != -1)
            signalhandler.send("mosaic_changelayout",that.mosaicview);
        else
        { 
            setCanvasLayout();
            drawHairCross();
        }                });
    layoutbar.$moszoomout = $("<span class='KViewPort_tool_layout'> <i class='fa fa-minus'></i> </span>").hide().click(
    function(e)
    {
        var amount = 1;
        that.mosaicview.nx_cont += ((amount > 0) ? -1 : 1);
        if (that.mosaicview.nx_cont < 2)
            that.mosaicview.nx_cont = 2;
        that.mosaicview.nx = Math.round(that.mosaicview.nx_cont);
       if (KViewer.mainViewport != -1)
            signalhandler.send("mosaic_changelayout",that.mosaicview);
       else
       { 
            setCanvasLayout();
            drawHairCross();
       }            
    });


    layoutbar.$leftrot = $("<span class='KViewPort_tool_layout'> <i class='fa fa-rotate-left'></i> </span>").hide();
    layoutbar.$rightrot = $("<span class='KViewPort_tool_layout'> <i class='fa fa-rotate-right'></i> </span>").hide();

    function ani3D(e, dir)
    {
        layoutbar.$rightrot.removeClass('KViewPort_tool_enabled');
        layoutbar.$leftrot.removeClass('KViewPort_tool_enabled');
        if (that.gl.animate3D(dir))
            $(e).addClass('KViewPort_tool_enabled');
    }

    function setGLprops(props)
    {
        var cid = setInterval(tryit,300)
        var cnt = 0;
        function tryit()
        {
            cnt++;
            if (that.gl != undefined)
            {
                that.gl.setprops(props)
                clearInterval(cid)
            }
            else if (cnt > 10)
                clearInterval(cid)
                
        }
    }
    that.setGLprops = setGLprops

  

    layoutbar.$leftrot.click(function() {
        ani3D(this, +1)
    });
    layoutbar.$rightrot.click(function() {
        ani3D(this, -1)
    });
    layoutbar.attach(layoutbar.$moszoomin)
    .attach(layoutbar.$moszoomout)
    .attach(layoutbar.$rightrot)
    .attach(layoutbar.$leftrot);

    layoutbar.showLayout3D = function() {
        layoutbar.$leftrot.show();
        layoutbar.$rightrot.show();
        if ( layoutbar.$shortcut3d)
            layoutbar.$shortcut3d.text("2D");

        layoutbar.$slicing.hide();
        layoutbar.$slideslices.hide();
        layoutbar.$center.hide();
    }
    layoutbar.hideLayout3D = function() {
        layoutbar.$leftrot.hide();
        layoutbar.$rightrot.hide();
        if ( layoutbar.$shortcut3d)
        {
            layoutbar.$shortcut3d.show();
            layoutbar.$shortcut3d.text("3D");
        }
        layoutbar.$slicing.show();
        layoutbar.$slideslices.show();
        layoutbar.$center.show();
        
    }




    // this should be implemented at another place ( in roiPanel)
    var ROIadder = function(_that) {
        return KContextMenu(
        function() {
            var upperadder
            var loweradder
            var $menu = $("<ul class='menu_context small'>")
            .append($("<hr width='100%'> "))
            .append($("<span>  &nbsp <i class='fa leftaligned fa-pencil-square-o fa-1x'></i>  ROI  </span>"))
            .append($("<hr width='100%'> "))
            .append($("<li onchoice='empty' > create empty </li>"))
            .append(upperadder= $("<li onchoice='upper' > larger than lower limit  </li>"))
            .append(loweradder=$("<li onchoice='lower' > lower than lower limit  </li>"))
            .append($("<hr width='100%'> "))
            .append($("<span> &nbsp <i class='fa leftaligned fa-shopping-basket fa-1x'></i> Miscellaneous  </span>"))
            .append($("<hr width='100%'> "))

            var currentid = _that.currentFileID;
            var matrices_available = [];

            if (that.currentFileID != currentid)
                  matrices_available.push({n:that.currentFilename,id:that.currentFileID})

            for (var i = 0; i < that.ROIs.length;i++)
                if (that.ROIs[i].roi.fileID != currentid)
                    matrices_available.push({id:that.ROIs[i].roi.fileID,n:that.ROIs[i].roi.filename})
            for (var i = 0; i < that.overlays.length;i++)
                if (that.overlays[i].currentFileID != currentid)
                    matrices_available.push({n:that.overlays[i].currentFilename,id:that.overlays[i].currentFileID})
            if (matrices_available.length>0)
            {
                var str_upper = "";
                var str_lower = "";
                for (var i = 0; i < matrices_available.length;i++)                    
                {
                    str_upper += "<li onchoice='upper_"+ matrices_available[i].id +"'> " + matrices_available[i].n + "  </li> "
                    str_lower += "<li onchoice='lower_"+ matrices_available[i].id +"'> " + matrices_available[i].n + "  </li> "
                }
                
                upperadder.append($(" <ul>  " + str_upper +" </ul>" ))
                loweradder.append($(" <ul>  " + str_lower +" </ul>" ))
            }
            if (_that.nii.sizes[3]%3 == 0)
            {
                var sel = _that.showcolored ? 'check-' : '';
                var type = _that.showcolored_type;
                $menu.append($("<li onchoice='rgbinterpret' > RGB interpret <i class='fa fa-caret-right'></i> <ul> " +
                "<li onchoice='rgbinterpret' > colored <i  onchoice='lock' class='fa fa-"+sel+"square-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_raw' > raw <i onchoice='lock' class='fa fa-"+((type=="raw") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_RGB' > RGB <i onchoice='lock' class='fa fa-"+((type=="RGB") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_BRG' > BRG <i onchoice='lock' class='fa fa-"+((type=="BRG") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_GBR' > GBR <i onchoice='lock' class='fa fa-"+((type=="GBR") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_GRB' > GRB <i onchoice='lock' class='fa fa-"+((type=="GRB") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_SOS' > SOS <i onchoice='lock' class='fa fa-"+((type=="SOS") ? 'check-' : '')+"circle-o'></i> </li>"));

            }

            if (_that.refSurfView != undefined)
            {
                var showview = "";
                if (!_that.refSurfView.toolbarAttached)
                    showview= " <i  onchoice='showisoview' class='fa button' style='right:30px;'>show view</i> "
             
                $menu.append($("<li onchoice='iso' > remove isosurface "+showview+" </li>"));
            }
            else
                $menu.append($("<li onchoice='iso' > create isosurface </li>"));


            if (_that.type != "mainview")
            {
                if (_that.outlines == undefined)
                    $menu.append($("<li onchoice='outline' > show contours </li>"));
                else
                { 
                    $menu.append($("<li onchoice='outline' > hide contours </li>"));
                    $menu.append($("<li onchoice='contcol' > > contour color  </li>"));
                }
            }


            if (_that.nii.sizes[3]%3 == 0)
                $menu.append($("<li onchoice='tracking' >create fiber tracking </li>"));
            
            $menu.append($("<li onchoice='refetch' > refetch file </li>"));

            $menu.append($("<hr width='100%'> "))

            $menu.append($("<li onchoice='reslice' > reformat/reslice image </li>"));            
            if (KViewer.reorientationMatrix.notID)
                $menu.append($("<li onchoice='burnin' > burnin current affine </li>"));
            $menu.append($("<li onchoice='download_header_info' > download header info </li>"));
            $menu.append($("<li onchoice='centermatrix' > center matrix to current position </li>"));
            


            var ROIs = KViewer.roiTool.ROIs
            var rois = Object.keys(ROIs);
            if (rois.length > 0)
            {

                var $submenu = $("<ul> </ul>") 
                var $item = $("<li  onchoice='...' >crop/mask<i  onchoice='lock' class='fa fa-caret-right'></i>").appendTo($menu)
                $item.append($submenu)

                 for (var k = 0; k < rois.length;k++)
                    $submenu.append($("<li onchoice='mask_ROI_"+rois[k]+"'  >"+ROIs[rois[k]].filename+" </li>"));

            }

			            
            if (_that.content && _that.content.refvisit_tck)
                $menu.append($("<li onchoice='unlinktck' > unlink fiber visits </li>"));


            return $menu;


        },
        function(str, ev)
        {
            function arrived(fobj)
            {
                    master.iterateMedViewers(function(m)
                    {
                        if (_that.currentFileID == m.currentFileID)
                                m.setContent(fobj, {intent: { ROI: true }  });
                        else 
                            for (var k = 0; k < m.overlays.length; k++)
                            {
                                if (_that.currentFileID == m.overlays[k].currentFileID)
                                {
                                    m.setContent(fobj, {intent: {ROI: true}});
                                    return;
                                }
                            }
                    });
                    that.ROIs[that.ROIs.length - 1].makeCurrent();
            }
            if (str == undefined)
                return;

            if (str == "unlinktck")
            {
                unlinktck(_that)
            }
            else if (str.substring(0,5) == "upper" | str.substring(0,5) == "lower" )            
            {
                var typ = str.substring(0,5);
                if (str.length == 5)
                    master.roiTool.pushROI(_that.currentFileID, "mask_"+ _that.currentFilename, typ + _that.histoManager.clim[0], arrived);
                else
                {
                    var id = str.substring(6)
                    $(document.body).addClass("wait");
                    setTimeout( function() {
                      master.roiTool.pushROI(id, "mask_"+ _that.currentFilename,undefined, function(fobj) {

                        var thres = _that.histoManager.clim[0];
                        var eqfun;
                        if (typ == "lower")
                            eqfun = function(x) { return x < thres; }
                        else
                            eqfun = function(x) { return x > thres; }


                        var nii = _that.nii;
                        var roi = fobj.content;
                        var offset = 0;
                        if (nii.currentTimePoint)
                            offset = nii.currentTimePoint.t * nii.sizes[0] * nii.sizes[1] * nii.sizes[2] ;
                        var A = (math.multiply(math.inv(nii.edges), roi.edges))._data;
                        for (var z = 0; z < roi.sizes[2]; z++)
                            for (var y = 0; y < roi.sizes[1]; y++)
                                for (var x = 0; x < roi.sizes[0]; x++)
                                {
                                    if (eqfun(trilinInterp(nii, x, y, z, A, offset)))
                                        roi.data[roi.sizes[1] * roi.sizes[0] * z + roi.sizes[0] * y + x] = 1;
                                }

                        arrived(fobj)
                       $(document.body).removeClass("wait");

                      } );
                    },0);

                }

            }
            else if (str == "empty")
                master.roiTool.pushROI(_that.currentFileID, "mask_untitled", undefined, arrived);
            else if (str == "iso")
                that.attachSurfaceRef(_that,_that.content);  
            else if (str == 'rgbinterpret')
            {
                _that.showcolored = !_that.showcolored;
                signalhandler.send("updateImage",{id:_that.currentFileID});                
            }
            else if (str.substring(0,17) == 'type_rgbinterpret')
            {
                _that.showcolored_type = str.substring(18);
                signalhandler.send("updateImage",{id:_that.currentFileID});                
            }
            else if (str == "showisoview")
            {
                    if (_that.refSurfView && !_that.refSurfView.toolbarAttached)
                    {
                        ev.preventDefault();
                        ev.stopImmediatePropagation();
                        that.toolbar.append(_that.refSurfView.divs,'surface')
                        _that.refSurfView.toolbarAttached = true;
                    }
            }
            else  if (str == "tracking")
            {
                if (that.isGLenabled())
                    createfibview()
                else
                    toggle3D(undefined,createfibview);
                function createfibview()
                {
                    var filename = _that.currentFilename.replace(".nii","").replace(".gz","") + ".tck";
                    var imageStruct = { fileinfo: { patients_id: that.currentFileinfo.patients_id,
                                        studies_id: that.currentFileinfo.studies_id },
                                        filename:filename,content:{tracts:[  ]} } ;     
                    var fv = master.obj3dTool.createFiberView(imageStruct,that,{ dirvolref: _that,isParentView:true });
                    that.objects3D.push(fv);
                }
            }
            else if (str == "outline")
            {
                var contvis = _that.outlines == undefined;


                if (!ev.shiftKey)
                {
                    var ev_ = ev;
                    master.iterateMedViewers(function(m)
                    {
                        
                        for (var k = 0; k < m.overlays.length; k++)
                            if (_that.currentFileID == m.overlays[k].currentFileID)
                            {
                                m.overlays[k].setOutlines(contvis,ev_)          
                                ev_ = undefined
                                break;
                            }

                    });            
                }
                else
                    _that.setOutlines(contvis,ev)



            }
            else if (str == "refetch")
            {
                KViewer.dataManager.refetchFile(_that.currentFileinfo, that.viewport.progressSpinner)
            }
            else if (str == "reslice")
            {
                
                alertify.prompt("New resolution of image in mm:", function(e, str) {
                    if (e)
                    {       
                        
                        var fac = eval(str);
                        
                        var fi = KViewer.dataManager.getFile(_that.currentFileID)
                        var vsz = fi.content.voxSize
                        resliceNifti(fi,[fac[0]/vsz[0],fac[1]/vsz[1],fac[2]/vsz[2]]);

                        var sp = fi.filename.split(".")
                        sp[0] = sp[0] + '_reformated';
                        fi.filename = sp.join(".");
                        if (fi.fileinfo && fi.fileinfo.Filename)
                            fi.fileinfo.Filename = fi.filename;

                        fi.editable = true;
                        fi.modified = true;
                        KViewer.cacheManager.update();

                        KViewer.setViewPortLayout()
                    }
                 },"[2,2,2]");
            

            }
            else if (str == "burnin")
            {
                    var fi = KViewer.dataManager.getFile(_that.currentFileID)
                
                    resliceNifti_affine(fi,(KViewer.reorientationMatrix.matrix));
                    var sp = fi.filename.split(".")
                    sp[0] = sp[0] + '_reformated';
                    fi.filename = sp.join(".");
                    if (fi.fileinfo && fi.fileinfo.Filename)
                        fi.fileinfo.Filename = fi.filename;
    
                    fi.editable = true;
                    fi.modified = true;
                    KViewer.navigationTool.resetTransform();
                    KViewer.cacheManager.update();            
                    KViewer.setViewPortLayout()
      
            }                
            else if (str == "centermatrix")
            {
                if (Object.keys(KViewer.navigationTool.movingObjs).length > 0)
                    alertify.confirm("There are already moving images defined in the navigation. When you proceed, all navigation information will be discarded.",
                                    function(e) {
                                        if (e)
                                            centermatrix()
                                    })
                else
                    centermatrix();

                function centermatrix()
                {
                    var fi = KViewer.dataManager.getFile(_that.currentFileID)     
                    for (var k in KViewer.navigationTool.movingObjs) delete KViewer.navigationTool.movingObjs[k];
            		KViewer.navigationTool.movingObjs[fi.fileID] = fi;
    				KViewer.navigationTool.updateMoving();
                    var csz = fi.content.sizes.slice(0,3).map((x)=>x*0.5-0.5).concat([1])
                    var center = kmath.multiply(fi.content.edges, csz)
                    var dif = kmath.add(KViewer.currentPoint,center,-1);
                    KViewer.reorientationMatrix.matrix._data[0][3] = -dif._data[0];
                    KViewer.reorientationMatrix.matrix._data[1][3] = -dif._data[1];
                    KViewer.reorientationMatrix.matrix._data[2][3] = -dif._data[2];
                    signalhandler.send("positionChange")
                }

            }            
            else if (str == "download_header_info")
            {
                var fi = _that.currentFileinfo
                var nii = _that.nii
                var hdr = {edges:nii.edges._data, 
                            voxSize:nii.voxSize,
                            sizes:nii.sizes,
                           extension:nii.extension}
                initiateDownload(JSON.stringify(hdr), fi.Filename.replace(".gz","").replace(".nii","") + "_header.json");		
            }            
            else if (str.substring(0,9) == "mask_ROI_")
            {
                var roiid = str.substring(9);
                var fi = KViewer.dataManager.getFile(_that.currentFileID)
                var roi = KViewer.dataManager.getFile(roiid)
                maskContrastWithROI(fi,roi)
                signalhandler.send("updateImage", { 
                    id:  fi.fileID,
                });
                fi.editable = true;
                fi.modified = true;
                KViewer.cacheManager.update();


                function maskContrastWithROI(cobj,roiobj)
                {
                    var nii = cobj.content                    
                    var roi = roiobj.content;
                    roi.A = (math.multiply(math.inv(roi.edges), nii.edges))._data;
                    for (var k = 0;k < nii.sizes[3];k++)
                    for (var z = 0; z < nii.sizes[2]; z++)
                        for (var y = 0; y < nii.sizes[1]; y++)
                            for (var x = 0; x < nii.sizes[0]; x++)
                            {
                                var v = trilinInterp(roi, x, y, z, roi.A, 0);
                                nii.data[nii.widheidep*k + nii.sizes[1] * nii.sizes[0] * z + nii.sizes[0] * y + x] *= v;
                                
                            }


                }
            }
            else if (str == "contcol")
            {
        
                _that.chooseContColor(ev);

            }

      
        });


       
    }



    function unlinktck(_that)
    {
        if (_that.content.refvisit_tck.visitworker != undefined)
        {
            _that.content.refvisit_tck.visitworker.kill();
            _that.content.refvisit_tck.visitworker = undefined;
        }
        if (_that.content.refvisit_tck.visitworker_terms != undefined)
        {
            _that.content.refvisit_tck.visitworker_terms.kill();
            _that.content.refvisit_tck.visitworker_terms = undefined;
        }                                    
        _that.content.refvisit_tck = undefined;
    }
    that.unlinktck = unlinktck;

    that.quivers = [];

    that.addQuiver = function(histoobj)
    {
        for (var k = 0; k < that.quivers.length;k++)
            {
                if (that.quivers[k] == histoobj)
                    return;
            }
        that.quivers.push(histoobj);

    }

    that.removeQuiver = function(histoobj)
    {
        for (var k = 0; k < that.quivers.length;k++)
            {
                if (that.quivers[k] == histoobj)
                {
                    that.quivers.splice(k,1);
                    return;
                }
            }
    }










    that.addAsROIMenu = ROIadder(that);


    /* this was used as a roi adder per viewport
    var toolbarRoi = {};
    toolbarRoi.$container =   $("<div class='KViewPort_roiAdder' style='position:relative;right:0px;'>add Roi</div>").appendTo(that.toolbar.$container).click(function(ev){return false;})
                                .hide();
    toolbarRoi.$addroi = $("<div class='KViewPort_tool'>  <i class='fa fa-plus fa-1x'> </div>").appendTo(toolbarRoi.$container )
            .appendTooltip("create new roi from this viewport image").click( function(){master.roiTool.createEmptyRoi(that, 'untitled');} );
    */


    // old: allow creation of roi here                          
    toolbar.$addroi = $("<div  class='KViewPort_tool'>  <i class='fa fa-cog fa-1x'> </div>").click(that.addAsROIMenu);
    //toolbar.$addroi = $("<div  class='KViewPort_tool'>  <i class='fa fa-pencil fa-1x'> </div>")
    //.appendTooltip("roitool_open").click(function() {
    //    master.roiTool.show()
    //});

    toolbar.$mainViewportSelector = $("<div myid='KViewPort_tool_toggleMainViewport' class='KViewPort_tool'><i class='fa fa-maxcdn fa-1x'></i></div>")
    .appendTooltip("masterviewport").click(function() {
        master.toggleMainViewport(viewport.viewPortID);
    });



    toolbar.$movie = $("<div class='KViewPort_movie_tool'><i class='fa fa-play fa-1x'></i></div>").click(function() {
        toggleMovie(this);
    });
    toolbar.$movie.hide();

    toolbar.attach(toolbar.$addroi).attach(toolbar.$mainViewportSelector).attach(toolbar.$movie);






    /************************* movie stuff  *********************/

    that.movieSpeedFPS = 5;
    function changemoviespeed()
    {
        toggleMovie();
        
        if(that.movieGlobalMode)
        {
            master.iterateMedViewers(function(m)
            {
                if (m.nii !=undefined && m.$timediv.maxt > 1 & m.movieGlobalMode)
                {
                    m.$timeinput_fps.val( $timeinput_fps.val() );
                    m.movieSpeedFPS = $timeinput_fps.val();
                }
			
    		});
        }
        else
        {
            that.movieSpeedFPS = $timeinput_fps.val();
        }

        toggleMovie();
    }


    var $timeinput_fps = $("<input class='KViewPort_tool' style='' type='' min=1 max=100000 value=" + that.movieSpeedFPS + " />")
    .appendTooltip("Movie Speed (frames per second")
    .on('change input', changemoviespeed);
    that.$timeinput_fps = $timeinput_fps;
    /*
     movie can be played 
        - globally: link all viewports (default), given by master.currentTimePointGlobal, master.movieIsPlayedGlobal
        - individually
    */
    var $setMovieGlobalMode = $("<div class='KViewPort_movie_tool'><i class='fa fa-link fa-1x'></i></div>").click( setMovieGlobalMode );
    
    that.movieGlobalMode = 1;
    function setMovieGlobalMode(state)
    {
        // do not allow to change mode during  play, otherwise will be a mess
        if(movieIsPlayed | master.movie.isPlayed)
            return false

        that.movieGlobalMode = !that.movieGlobalMode;
        if(!that.movieGlobalMode)
        {
            $setMovieGlobalMode.css('background', 'red');
        }
        else
        {
            $setMovieGlobalMode.css('background', '');
        }
    }    

    var $timeinput = $("<input class='KViewPort_tool KViewPort_tool_movie_slider' type='range' min=0 max=100 value=0>");
    var $timeCurrent = $("<span class='KViewPort_movie_tool'>0</span>");
    var $timediv = $("<div class='KViewPort_toolbar KTimeRangeSlider'> </div>").appendTo($container)
    .append($timeCurrent).append($timeinput).append(toolbar.$movie).append($timeinput_fps).append($setMovieGlobalMode)
    .hide();
    that.$timediv = $timediv;
    that.$timediv.$timeinput = $timeinput;
    
    // this is called when new image is loaded
    $timediv.update = function()
    {

        var maxt = 1;
        if (that.nii != undefined && that.nii.numTimePoints > 1)
            maxt = that.nii.numTimePoints;

        for (var k = 0; k < that.overlays.length; k++)
            if (that.overlays[k].nii.numTimePoints > maxt)
                 maxt = that.overlays[k].nii.numTimePoints;

        for (var k = 0; k < that.ROIs.length; k++)
            if (that.ROIs[k].nii.numTimePoints > maxt)
                 maxt = that.ROIs[k].nii.numTimePoints;

        if (maxt > 1)
        {
            $timediv.maxt = maxt;
            that.toolbar.$movie.show();
            $timediv.show();
            $timeinput.attr("max", maxt-1 );
            that.setMovieState(movieIsPlayed | master.movie.isPlayed);
                        
        }
        else
        {
            $timediv.maxt = 1;
            that.toolbar.$movie.hide();
            $timediv.hide();
        }
    }

    KMouseSlider($timeinput_fps, {min:1, incrementPerPixel:0.1});


    $timeinput.on('change input', function(){setCurrentTimePoint( $(this).val() ); } );
    //$timeCurrent.on('mousewheel', timeinputwheel)
    //$timediv.on('mousewheel', timeinputwheel)

    if (/Firefox/i.test(navigator.userAgent))
        $timediv.get(0).addEventListener("DOMMouseScroll", timeinputwheel, false);
    else
        $timediv.get(0).addEventListener("mousewheel", timeinputwheel, false);



    function timeinputwheel(e)
    {
        if(e.wheelDelta || -e.detail) 
            var amount = (e.wheelDelta || -e.detail) > 0 ?1:-1;
        else
            var amount = (e.originalEvent.wheelDelta || -e.originalEvent.detail) > 0 ?1:-1;

        var newval =  parseInt($timeinput.val()) + amount;
        if(newval >= 0)
        {
            setCurrentTimePoint(newval,e)
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    
    // set the current time global/local from gui or from an iteration loop
    function setCurrentTimePoint(val,e)
    {
        var global = that.movieGlobalMode;
        if (e != undefined && e.shiftKey)
            global = false;
            
        if (global)
        {   
            master.movie.currentTimePoint = val;
            master.iterateMedViewers(function(m)
            {
                if (m.nii !=undefined & m.movieGlobalMode & global)
                {
                    m.updateCurrentTimePoint(val);
                }
			
    		});

        }
        else
        {
            that.updateCurrentTimePoint(val);
        }
    }

    that.updateCurrentTimePoint = function(val)
    {



        var ovls = that.overlays;
        for (var k = 0; k < that.objects3D.length;k++)
            if (that.objects3D[k].overlays && that.objects3D[k].overlays.length > 0)
                ovls = ovls.concat(that.objects3D[k].overlays)
        for (var k = 0; k < ovls.length; k++)
        {
            var xnii = ovls[k].nii;
            if (xnii.numTimePoints > 1 && xnii.numTimePoints >= val)
            {
                xnii.currentTimePoint.t = val;
                ovls[k].$timeinput.val(val);
                signalhandler.send("overlay_climChange", { 
                    id:  ovls[k].currentFileID,
                    val: ovls[k].histoManager.clim        
                });

            }
        }
        
        for (var k = 0; k < that.ROIs.length; k++)
        {
            var xnii = that.ROIs[k].nii;
            if (xnii.numTimePoints > 1 && xnii.numTimePoints >= val)
            {
                xnii.currentTimePoint.t = val;
                if (that.ROIs[k].$timeinput != undefined)
                    that.ROIs[k].$timeinput.val(val);
                signalhandler.send("updateImage", { 
                    id:  that.ROIs[k].roi.fileID,
                });
            }
        }
        
        if ($timediv.maxt <= 1)
            return;
        
        if( val > $timediv.maxt-1)
            val = $timediv.maxt-1;    
        if(val < 0)
            val = 0;    
            
        val = parseInt(val);

        if (that.nii.numTimePoints > 1 && val < that.nii.numTimePoints )
            that.nii.currentTimePoint.t = val;

        if (that.nii.extension && that.nii.extension.content && that.nii.timePointDescrip !== false)
        {
            that.nii.timePointDescrip = false;
            if (typeof that.nii.extension.content == "string")
            {
                 var dates = that.nii.extension.content.split(" ")
                 if (dates.length == that.nii.numTimePoints)
                     that.nii.timePointDescrip = dates;
            }

        }



        $timeinput.val(  val );
        $timeCurrent.text( val );

        if (that.nii.timePointDescrip)
        {
            $timeCurrent.text(that.nii.timePointDescrip[val] + " (" + val + ")");
        }




        // seems to be simpelst way to initiate all updates
        signalhandler.send("climChange", { 
            id: that.currentFileID,
            val: that.histoManager.clim,            
        });
     
        if(KViewer.curveTool.enabled)
            KViewer.curveTool.updateCurrentTimePoint(val);
    }
    
    

    function toggleMovie( )
    {
        // global play
        if(that.movieGlobalMode)
        {
            master.movie.maxNumTimePoints = 1;
            master.iterateMedViewers(function(m)
            {
                if (m.nii !=undefined && m.$timediv.maxt > 1  && m.movieGlobalMode)
                {
                    m.setMovieState( !master.movie.isPlayed );
                    if(m.$timediv.maxt > master.movie.maxNumTimePoints)
                        master.movie.maxNumTimePoints = m.$timediv.maxt;
                }

            });

            if(master.movie.isPlayed)
            {
                clearInterval( master.movie.timerId);
                master.timerId = false;
        	}
        	else
        	{
                master.movie.timerId = setInterval(function()
                {

                    if (typeof executeImageWorker != "undefined" && executeImageWorker.createIsoSurf_running)
                        return;
                    master.movie.currentTimePoint =  (  master.movie.currentTimePoint + 1 ) %  master.movie.maxNumTimePoints; 
                    master.iterateMedViewers(function(m)
                    {
                        if (m.nii !=undefined &&  m.$timediv.maxt > 1  && m.movieGlobalMode)
                        {
                            m.updateCurrentTimePoint(master.movie.currentTimePoint);
                        }

                    });


                }, 1000 * 1 / that.movieSpeedFPS);
        	}
            
            master.movie.isPlayed = !master.movie.isPlayed;


        }
        else // local play
        {
            if(movieIsPlayed)
            {
                clearInterval( timerId);
                timerId = false;
                that.setMovieState(false);
            }
            else
            {
                timerId = setInterval(function()
                {
                    that.updateCurrentTimePoint( (parseInt($timediv.$timeinput.val()) + 1) %  $timediv.maxt );

                }, 1000 * 1 / that.movieSpeedFPS);

                that.setMovieState(true);
            }
        }
    }

    // set movie playing state in gui
    that.setMovieState = function(state )
    {
        movieIsPlayed = state;

        if (movieIsPlayed)
            toolbar.$movie.find('i').removeClass('fa-play').addClass('fa-stop');
        else
            toolbar.$movie.find('i').addClass('fa-play').removeClass('fa-stop');
    }
/*
    signalhandler.attach("positionChange", function()
    {
        if (that.$timediv.nii)
        {
            $timeinput.val(that.$timediv.nii.currentTimePoint.t);
            $timeCurrent.html(that.$timediv.nii.currentTimePoint.t);
        }
    })
*/
    var movieIsPlayed = false;
    var timerId = 0;



    /* get full filename */
    that.getFullFilename = function()
    {
        if(that.currentFileinfo == undefined)
            return;
 	    if(that.currentFileinfo.SubFolder!=="")
			return that.currentFileinfo.SubFolder + "/" +  that.currentFileinfo.Filename;
        else
            return that.currentFileinfo.Filename;

    }

    /************************* getCurrentReadDirections *********************/
    that.getCurrentReadDirections = function()
    {
        var nii = that.nii;
        if (slicingDimOfWorld == 0)
        {
            return [nii.arrayReadDirection[nii.invPermOrder[1]] , nii.arrayReadDirection[nii.invPermOrder[2]] ];
        }
        if (slicingDimOfWorld == 1)
        {
            return [nii.arrayReadDirection[nii.invPermOrder[0]] , nii.arrayReadDirection[nii.invPermOrder[2]] ];
        }
        if (slicingDimOfWorld == 2)
        {
            return [nii.arrayReadDirection[nii.invPermOrder[0]] , nii.arrayReadDirection[nii.invPermOrder[1]] ];
        }
    }


    /************************* world position management *********************/

    function getWorldPosition()
    {
        if (that.isFlatMap)
            return customPoint;

        if (worldLockedToMaster & KViewer.globalCoordinates)
            return master.currentPoint;
        else
            return customPoint;

    }
    that.getWorldPosition = getWorldPosition;

    function setWorldPosition(p)
    {


        // CONGRU
        if (KViewer.mainViewport == -1)
        {

  //          if (KViewer.navigationTool.isinstance && 
//                (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ))
            if (isBackgroundMoving() | KViewer.navigationMode == 2 )
                {
                    p = math.multiply(math.inv(master.reorientationMatrix.matrix), p);
                    KViewer.currentPoint = p;
                } 
        }


        customPoint = p;
        if (that.isFlatMap)
        {
            KViewer.currentPoint = mapFlatMapCoordinate(p)
            return;
        }
        if ( (worldLockedToMaster & KViewer.globalCoordinates) | KViewer.mainViewport != -1)
        {      
            KViewer.currentPoint = p;
        }
        else
        {



        }
    }
    that.setWorldPosition = setWorldPosition;


    that.postsetContent = function()
    {          

    }



    function mapFlatMapCoordinate(p)
    {
        var df = KViewer.atlasTool.invdefField.content
        var v = math.round(math.multiply(math.inv(df.edges),p)._data);
        var idx = v[0]+v[1]*df.wid+v[2]*df.widhei;
        return math.matrix([ df.data[idx+df.widheidep],
                          df.data[idx+df.widheidep*2],
                          df.data[idx+df.widheidep*3],1 ]);
    }


    var worldLockedToMaster = true;
    var customPoint = math.matrix([0,0,0,1])
    function changeWorldLock(e)
    {
        var $target = toolbar.$lock;//$(e.target);
        if (!$target.hasClass('fa'))
            $target = $target.find("i");
        $target.toggleClass('fa-lock');
        $target.toggleClass('fa-unlock');
        
        if (worldLockedToMaster)
            customPoint = math.matrix(getWorldPosition());
        worldLockedToMaster = !worldLockedToMaster;
        drawSlice({
            mosaicdraw: true
        });

    }



    // attach misc stuff
    var $infobar = $("<div draggable=true id='KViewPort_infobar' class = 'KViewPort_infoDIV'></div>").appendTo($topRow);
    $infobar.attr("draggable", 'true');
    that.$infobar = $infobar;

    that.$infobar.on("click",function(ev)
    {
       if (KViewer.zoomedViewport != -1)
       {
           if (!that.viewport.isZoomed())
           {
               KViewer.unZoomViewport();
               that.viewport.zoomViewPort();
           }
           else
                that.viewport.zoomViewPort();
          
       }
        
    });


  that.$infobar.on("mousedown",function(ev)
    {
        if (ev.button == 2)
            showInfoContextNifti(that,ev)                
    });



    var $LeftRightSign = $("<div class='KViewPort_description'>R</div>").hide().appendTo($container);
    that.$LeftRightSign = $LeftRightSign;

    // attach the scrollAccel
    var scrollSpeed = 1;

    var $scrollAccelerator = $("<div class='KViewPort_scrollAccelerator' ></div>").appendTo(that.layoutbar.$container)
    that.layoutbar.$container.mouseenter(function(ev) {
        ev.preventDefault();
        scrollSpeed = 4;
        //$scrollAccelerator.text('scroll speed +' +scrollSpeed);
    });
    that.layoutbar.$container.mouseleave(function(ev) {
        scrollSpeed = 1;
        //$scrollAccelerator.text('');
    });
    
   

    // attach the canvas
    var $canvas = $("<canvas class='KViewPort_canvas'></canvas>").appendTo($canvascontainer);
    that.$canvas = $canvas;
    var ctx = $canvas.get(0).getContext("2d");


    var $canvas3D = $("<canvas class='KViewPort_canvas3D'></canvas>").appendTo($container);
    that.$canvas3D = $canvas3D;
    $canvas3D.hide();
    var gl;
    var gl_enabled = false;
    that.isGLenabled = function()
    {
        return gl_enabled;
    }


    // attach the haircross
    var haircross = {
        X: {
            t: "X",
            tilt: 0
        },
        nX: {
            t: "X",
            tilt: 0
        },
        Y: {
            t: "Y",
            tilt: 0
        },
        nY: {
            t: "Y",
            tilt: 0
        },
        C: {}
    };
    that.haircross = haircross;
    //haircross.C.$circle = $("<div class='haircrossFocus'></div>").appendTo($canvascontainer);
    //haircross.C.$circle = $("<div class='haircrossFocus_new'><i class='fa fa-3x fa-refresh'></i><i class='fa fa-3x fa-arrows'></i><div></div></div>").appendTo($canvascontainer);
    haircross.C.$circle = $("<div class='haircrossFocus_new'></div>").appendTo($canvascontainer);
    haircross.C.$circle_center = $("<i class='fa fa-3x fa-refresh'></i>").appendTo(haircross.C.$circle).append($("<i class='fa fa-3x fa-arrows'></i>"));
    haircross.C.$circle_rotIndicator = $("<div class=''></div>").appendTo(haircross.C.$circle);
    haircross.C.$circle_scaleDot = $("<i class='fa fa-3x fa-circle-o'></i>").appendTo(haircross.C.$circle);

    haircross.X.lineN = new KHaircross(); haircross.X.lineN.$main.appendTo($canvascontainer)
    haircross.Y.lineN = new KHaircross(); haircross.Y.lineN.$main.appendTo($canvascontainer);

    that.overlays = [];
    that.objects3D = [];
    that.ROIs = [];
    that.ROIs_temp = [];
    that.atlas = [];
    that.currentROI = undefined;
    that.getCurrentROIobj = function()
    {
        for (var k = 0; k < that.ROIs.length; k++)
        {
            if (that.ROIs[k].roi == that.currentROI)
                return that.ROIs[k];
        }
        return undefined;
    }

    var sx = 10;
    var sy = 10;
    var xdir = -1;
    var ydir = -1
    var xflip, yflip;

    that.zoomFac = 1;
    that.zoomOriginX = 0;
    that.zoomOriginY = 0;
    that.widoffs_px = 0;
    that.heioffs_px = 0;
    that.embedrelfac = 1;


    var swapXY = false;
    // sizes for the canvases
    var csx, csy, voxSize_x, voxSize_y, wid_cm, hei_cm, wid_px, hei_px;

    that.subsample_factor_x = 1;
    that.subsample_factor_y = 1;
    //    var embedfac_height,embedfac_width;

    var sliceData;

    var mip_slab = 5;
    var avg_slab = 15;
    // =  ctx.createImageData(10, 10);

    var currentSlice = 0;
    that.getCurrentSliceInMM = function() {
        return (currentVoxel._data[slicingDimOfArray] + .5) * that.nii.voxSize[slicingDimOfArray]
    }
    ;
    var currentVoxel = math.matrix([0, 0, 0, 1]);
    var currentValue = 0;
    var tOffset = 0;
    var slicingDimOfWorld = 2;
    var slicingDimOfArray;
    function getCurrentSlice() {
        return currentSlice;
    }
    that.getCurrentSlice = getCurrentSlice;
    function getSlicingDimOfArray() {
        return slicingDimOfArray;
    }
    that.getSlicingDimOfArray = getSlicingDimOfArray;


    //    var MouseWheelHandler = moveUnlagger(MouseWheelHandler_);
    //    var MouseWheelHandler = MouseWheelHandler_;

    var icontainer = $container[0];
    if (icontainer.addEventListener) {
        // Firefox
        if (/Firefox/i.test(navigator.userAgent))
            icontainer.addEventListener("DOMMouseScroll", moveUnlagger(MouseWheelHandler_), false);
        else
        // IE9+, Chrome, Safari, Opera
            icontainer.addEventListener("mousewheel", MouseWheelHandler_, false);
        //       var mousewheelevt=(/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel" //FF doesn't recognize mousewheel as of FF3.x
        //     icontainer.addEventListener(mousewheelevt,MouseWheelHandler,false);
        icontainer.addEventListener("mouseleave",function()
        {
                    if (KViewer.roiTool.isinstance)
                        KViewer.roiTool.hidePen(that);
            
            }, false);

    }
    else
    {
        // IE 6/7/8
        icontainer.attachEvent("onmousewheel", MouseWheelHandler);
    }


    that.$container = $container;

    that.setSlicingDimOfWorld = setSlicingDimOfWorld;
    that.getSlicingDimOfWorld = function() {
        return slicingDimOfWorld;
    }
    ;
    that.setCurrentVoxel = setCurrentVoxel;
    that.setInnerLayout = setCanvasLayout;
    that.setZoomLims = setZoomLims;
    that.setZoomLimsRelative = setZoomLimsRelative;
    that.drawHairCross = drawHairCross;
    that.updateInfoBar = updateInfoBar;


    that.setContent = setContent;
    that.setColorMapLims = setColorMapLims;

    that.showcolored = false;
    that.showcolored_type = "RGB";


    function toggle3D(ev, callback)
    {
        that.old_hc_pos_x = undefined
        that.old_hc_pos_y = undefined

        
        if (webgl_detect())
        {
            toolbar.$toggle3D.toggleClass('KViewPort_tool_enabled');
            toolbar.$slicingDim.show();
            if (gl_enabled)
            {
                gl_enabled = false;
                $canvas3D.hide();
                layoutbar.hideLayout3D();


                for (var k = 0; k < that.objects3D.length; k++)
                {
                    if (that.objects3D[k].fibers && that.objects3D[k].fiberUpdater)
                        that.objects3D[k].fiberUpdater.clear();
                }

                setSlicingDimOfWorld(slicingDimOfWorld);
                $scrollAccelerator.show();
                drawSlice();

                if (callback)
                    callback();
            }
            else
            {

                that.mosaicview.active = false;

                that.viewport.progressSpinner("loading webGL");
                var onBabylon = function()
                {
                    gl_enabled = true;
                    that.viewport.progressSpinner();
                    layoutbar.showLayout3D();
                    that.subsample_factor_x = 1;
                    that.subsample_factor_y = 1;
                    setCanvasLayout();

                    if (KViewer.roiTool.isinstance)
                        KViewer.roiTool.hidePen(that);
                     
                    $scrollAccelerator.hide();
                    for (var k = 0; k < that.ROIs[k];k++)
                        KViewer.roiTool.update3D(that.ROIs[k].roi);

                    drawSlice();
                    if (callback)
                        callback();
                }
                
                if (typeof BABYLON == "undefined")
                    initBabylon(onBabylon); 
                else
                    onBabylon();

            }
        }
        else
        {
            alertify.error("Your browser has no WebGL enabled!")
        }
    }
    that.toggle3D = toggle3D;

    function toggleSlicingDim(ev)
    {

        
        if (!gl_enabled)
        {
            
            if (that.nii != undefined) // save old crosshair position
            {
                var old_hc_pos_x
                var old_hc_pos_y
                var x = getCanvasCoordinates(getWorldPosition());
                var cpos = that.$canvas.offset();
                cpos.top -= that.$container.offset().top;
                cpos.left -= that.$container.offset().left;
                old_hc_pos_x = x.x_pix + cpos.left
                old_hc_pos_y = x.y_pix + cpos.top

                if (old_hc_pos_x <0 | old_hc_pos_x > that.$container.width()
                   | old_hc_pos_y <0 | old_hc_pos_y > that.$container.height())
                {
                    old_hc_pos_x = that.$container.width()/2;
                    old_hc_pos_y = that.$container.height()/2;
                }

                setSlicingDimOfWorld('toggle');

                var coords = getCanvasCoordinates(getWorldPosition());
                var dy = coords.y_pix+that.heioffs_px*that.zoomFac-old_hc_pos_y
                var dx = coords.x_pix+that.widoffs_px*that.zoomFac-old_hc_pos_x;
                setZoomLims([that.zoomFac, dy, dx]);


            }
            else
              setSlicingDimOfWorld('toggle');



/*

            //// if crosshair is out view,then center view
            var coords = getCanvasCoordinates(getWorldPosition());
            var absy = (that.heioffs_px * that.zoomFac - that.zoomOriginY +coords.y_pix);
            var absx = (that.widoffs_px * that.zoomFac - that.zoomOriginX +coords.x_pix);
            if (absy<0 | absy>$container.height())
            {
                 var dy = coords.y_pix+that.heioffs_px*that.zoomFac-$container.height()/2;
                 setZoomLims([that.zoomFac, dy,undefined]);            
            }
            if (absx<0 | absx>$container.width())
            {
                 var dx = coords.x_pix+that.widoffs_px*that.zoomFac-$container.width()/2;
                 setZoomLims([that.zoomFac, undefined,dx]);            
            }
*/
            drawHairCross();
        }
        else
        {
            gl.planesVisContextMenu(ev);
        }
    }


    that.showControls = function() {

        // this should avoid the style bug of the viewport tools
        // the bug: from somwehere some viewport tools get a display:block,
        // with this we get rid of any style attributes
        that.toolbar.reset_mainview ();        

        that.toolbar.show();
        that.layoutbar.show();
        if (gl_enabled)        
        {
            layoutbar.showLayout3D();
            signalhandler.send("picto3dmodel_show");            
        }
        else
            layoutbar.hideLayout3D();

        if (that.mosaicview.active)
            that.mosaicview.showControls();

        

        $timediv.update();



        that.toolbar.$addroi.show();

        if (that.nii.singleSlice)
        {
            //that.toolbar.$mainViewportSelector.hide()
            that.toolbar.$toggle3D.hide()
            that.toolbar.$cmap.hide()
            that.toolbar.$cmapReset.hide()
            that.toolbar.$slicingDim.hide();
        }
        else
        {
        //    that.toolbar.$mainViewportSelector.hide()
            that.toolbar.$toggle3D.show()
            that.toolbar.$slicingDim.show();

            that.toolbar.$cmap.show()
            that.toolbar.$cmapReset.show()
            

        }
        if (!interpretAsColoredVolume(that.nii,that))
            that.toolbar.$quiver.hide();
        else
            that.toolbar.$quiver.show();

        if (that.nii.dummy)
        {
            that.toolbar.$cmap.hide();
            that.toolbar.$addroi.hide();
            that.toolbar.$view.hide();
        }
        else
        {            
            that.toolbar.$view.show();
        }


        that.toolbar.$info.hide();
      //  that.toolbar.$slicingDim.hide();
        that.toolbar.$toggle3D.hide();
        that.toolbar.$lock.hide();
        that.toolbar.$cmapReset.hide();

 
    }

    that.hideControls = function(whichcontrols) 
    {
        
        if(whichcontrols == true || whichcontrols == undefined)
        {
            that.toolbar.hide();
            that.layoutbar.hide();
            $timediv.hide();
        }
        else
        {
            if(whichcontrols.toolbar)
                 that.toolbar.hide();
            if(whichcontrols.layoutbar)
                 that.toolbar.hide();
            if(whichcontrols.timediv)
                 $timediv.hide();
        }
        
        if (that.mosaicview.active)
            that.mosaicview.hideControls();

       
        if (gl_enabled)        
        {
            layoutbar.showLayout3D();
        //    signalhandler.send("picto3dmodel_hide");

        }

        // why? we do not want to see that
        //layoutbar.showLayout3D();
        
    }


    function changeColorMap()
    {
        histoManager.cmapindex = (histoManager.cmapindex + 1) % colormap.maps.length;
        drawSlice({
            noquiver: true
        });
        drawHairCross();
    }

    function close_and_check_unsaved()
    {
        var unsaved = unsavedChanges();
        if (unsaved != "")
        {
            alertify.confirm("Are you sure to close this view, there are unsaved " + unsaved + " somewhere!",function(e)
    		{ 
                if (e) close();
            });
			return;
        }
        close();
    }
    that.close_and_check_unsaved = close_and_check_unsaved;
    
    function close()
    {
        that.$container.css('background','#000000')

        toolbar.hide();

        $timediv.hide();
//        layoutbar.hideLayout3D();
        $infobar.hide();
        hideHairCross();
        $canvas.hide();
        $canvas3D.hide();
        if (that.gl != undefined)
        {
            that.gl.disposePlanes();
            var tmpobjects3d = that.objects3D.slice(0);
            for (var k = 0; k < tmpobjects3d.length; k++)
                tmpobjects3d[k].close();
            if (gl_enabled)
            {
                toolbar.$toggle3D.toggleClass('KViewPort_tool_enabled');
                gl_enabled = false;
                that.gl.dispose();
                that.gl = undefined;
                gl = undefined;
            }
        }

        if (that.refSurfView)
            that.refSurfView = undefined;

        if (that.currentFileinfo && that.currentFileinfo.surfreference)
            that.currentFileinfo.surfreference = undefined;

        that.currentFileID = undefined;
        that.currentFilename = undefined;
        that.currentFileinfo = undefined;
        that.content = undefined;
        that.visible = true;

        clearInterval(timerId);
        movieIsPlayed = false;
        that.nii = undefined;
        histoManager.hide();
        histoManager.nii = undefined;
        lastSlice = undefined;

        //slicingDimOfWorld = 2;
        histoManager.cmapindex = 0;

        quiver.clear();
        that.removeQuiver(histoManager);
        that.toolbar.$quiver.hide();

        that.toolbar.update();

        if (that.outlines != undefined)
        {
            that.outlines.close();
            that.outlines = undefined;
        }

        $timeinput.val(  KViewer.movie.currentTimePoint );
        $timeCurrent.text(  KViewer.movie.currentTimePoint );


        var tmp = that.overlays.slice(0);
        for (var k = 0; k < tmp.length; k++)
            tmp[k].close();
         
        that.overlays.splice(0);

        var tmp = that.ROIs.slice(0);
        for (var k = 0; k < tmp.length; k++)
            tmp[k].close();

        that.ROIs.splice(0);

        var tmp = that.atlas.slice(0);
        for (var k = 0; k < tmp.length;k++)
            tmp[k].close(true);
         that.atlas.splice(0);
    

        viewport.close();

    }
    that.close = close;

    toolbar.$screenshot.click(function(e) {
        e.preventDefault();
        e.stopPropagation();
        screenshot_contextmenu(e);
    })
    var screenshot_contextmenu  = (KContextMenu(
    function() {

        var $menu = $("<ul class='menu_context'>")
        .append($("<li onchoice='normal' > 2D still png</li>"))
        .append($("<li onchoice='renderRGB' > render volume (RGB) as nifti</li>"))
        .append($("<li onchoice='render' > render volume as nifti </li>"));
        
        if (that.isGLenabled())
        {
            $menu.append($("<li> 3D views <i class='fa fa-caret-right'></i> <ul> <li onchoice='3dview_all'> all </li> " +
                                              "<li onchoice='3dview_sag'> saggital </li> " +
                                              "<li onchoice='3dview_ax'> axial/coronal </li> " +
                                              " </ul> "));        }
                                              

        return $menu;

    },
    function(str, ev)
    {

        function saveRenderedVolume(name, rgb)
        {
            var fobj;
            var nC;
            if (rgb)
                nC = 3;
            else
                nC = 1;
            if (KViewer.mainViewport == -1)
                fobj = cloneNifti(that.content, name, 'uint8', nC);
            else
            {
                var content;
                if (KViewer.mainViewport == "world")
                    content = {content:KViewer.viewports[KViewer.mainViewport].medViewer.nii};
                else
                    content = KViewer.viewports[KViewer.mainViewport].getCurrentViewer().content;
                fobj = cloneNifti(content, name, 'uint8', nC);
                if (fobj.fileinfo.patients_id == undefined && patientTableMirror)
                {
                     fobj.fileinfo = $.extend(fobj.fileinfo,patientTableMirror.getCurrentUniquePSID());
                }
            }

            updateSubsamplingFactor(true);

            var nii = fobj.content;
            var tmp_slW = slicingDimOfWorld;

            applySlicingDimOfWorld(that.nii.permutationOrder[2]);

            sliceData = ctx.createImageData(csx, csy);

            var drawSliceFun;
            if (KViewer.mainViewport != -1)
                drawSliceFun = drawSlice_interpolate;
            else
                drawSliceFun = drawSlice_normal;

            var totsz = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];
            for (var k = 0; k < nii.sizes[2]; k++)
            {
                setTimeout(function(k) {
                    return function() {
                        sliceData.data.fill(0);
                        drawSliceFun(k, undefined, true);
                        var idx;
                        for (var c = 0; c < nC; c++)
                            for (var x = 0; x < nii.sizes[0]; x++)
                                for (var y = 0; y < nii.sizes[1]; y++)
                                {
                                    if (swapXY)
                                        idx = ((nii.sizes[0] * xflip + xdir * (x) - xflip) * sy + yflip * nii.sizes[1] + ydir * (y) - yflip) * 4;
                                    else
                                        idx = ((nii.sizes[1] * yflip + ydir * y - yflip) * sx + xflip * nii.sizes[0] + xdir * (x) - xflip) * 4;
                                    nii.data[c * totsz + k * nii.sizes[0] * nii.sizes[1] + y * nii.sizes[0] + x] = sliceData.data[idx + c];
                                }

                        that.viewport.progressSpinner("rendering volume " + Math.round(100 * k / nii.sizes[2]) + "%");
                        if (k == nii.sizes[2] - 1)
                        {

                            applySlicingDimOfWorld(tmp_slW);
                            sliceData = undefined;

                            fobj.modified = true;
                            fobj.content = prepareMedicalImageData(parse(fobj.buffer), fobj, {});
                            fobj.fileID = 'REN' + (ovlcnt++);
                            fobj.fileinfo.permission = "rwp";
                            fobj.fileinfo.Tag = "";
                            KViewer.dataManager.setFile(fobj.fileID, fobj);


                            updateTag(fobj.fileinfo,[], userinfo.username);
                            
                            uploadUnregisteredBinary(fobj, {}, that.viewport.progressSpinner, function() {});

                        }

                    }
                }(k), 1);
            }



        }

        if (str == 'normal')
            that.takeScreenshot();
        else if (str != undefined && str.substring(0,6) == "3dview")
        {

            var $C = that.$container.find(".KViewPort_canvas:visible, .KViewPort_canvas3D:visible");
  
            var horizontal = true;

            KViewer.toggleElementsForScreenShot();
        
            var views;
            if (str.substring(7) == 'all')
            {
                var views = [[0, Math.PI/2-0.3 ,0.9,0],        // frontal
                             [Math.PI, Math.PI/2-0.3, 1,0],            // occipital
                             [Math.PI/2, Math.PI/2 ,0.9,1],
                             [-Math.PI/2, Math.PI/2 ,0.9,1],
                             [Math.PI,0 ,0.9,0],                     // top
                             [0,Math.PI ,1,0],                     // bottom
                  //           [-Math.PI/2, Math.PI/2 ,1,0],         
                  //           [Math.PI/2, Math.PI/2 ,0.9,-1],
                  //           [Math.PI/2, Math.PI/2 ,1,0],
                             ];
            }
            else if (str.substring(7) == 'ax')
            {
                var views = [[0, Math.PI/2-0.3 ,0.9,0],        // frontal
                  //           [Math.PI, Math.PI/2 ,1,0],            // occipital
                             [Math.PI,0 ,1,0],                     // top
                             [0,Math.PI ,1 ,0],                     // bottom
                             ];
            }
            else if (str.substring(7) == 'sag')
            {
                var views = [
                             [Math.PI/2, Math.PI/2, 0.9,-1],
                             [Math.PI/2, Math.PI/2,1 ,0],
                             
                             [-Math.PI/2, Math.PI/2,1 ,0],         
                             [-Math.PI/2, Math.PI/2,0.9 ,1],
                             ];
            }
            var shots = []
            var cnt = 0;
            var rad_def = that.gl.camera.radius;
            getShot();
            function getShot()
            {
                if (cnt>= views.length)
                {

                    var w = $C.get(0).width;
                    var h = $C.get(0).height;
                    var canvas,image;
                    if (horizontal)
                    {
                        canvas = $("<canvas width="+w*views.length+" height="+h+"></canvas>").get(0);
                        image = new Image(w*views.length,h);
                    }
                    else
                    {
                        canvas = $("<canvas width="+w+" height="+h*views.length+"></canvas>").get(0);
                        image = new Image(w,h*views.length);
                    }
                    var context = canvas.getContext('2d');
                    var image = new Image(w*views.length,h);
                    for (var k = 0; k < shots.length; k++)
                    {
                        image.src = shots[k];
                        if (horizontal)
                            context.drawImage(image,w*k,0);
                        else
                            context.drawImage(image,0,h*k);

                    }

                    var blob = dataURItoBlob(canvas.toDataURL())
                    var finfo = that.viewport.getCurrentViewer().currentFileinfo; 
                    that.gl.camera.radius = rad_def;

                       saveScreenShot(blob,finfo);
                     KViewer.toggleElementsForScreenShot();
                     $(".KViewPort_container").removeClass('noBorder');
                    return;
                }
                if (that.objects3D.length > 0 && that.objects3D[0].cuts)
                {
                    for (var j = 0; j < that.objects3D.length; j++ )
                    {
                        if (that.objects3D[j].cuts != undefined)
                        {
                            that.objects3D[j].cuts[that.nii.permutationOrder[0]] = views[cnt][3];
                            that.objects3D[j].update();
                        }
                    }
                }
                that.gl.camera.alpha= views[cnt][0];
                that.gl.camera.beta= views[cnt][1];
                that.gl.camera.radius = rad_def*views[cnt][2];
                that.gl.activateRenderLoop();
                cnt++;
                setTimeout(function(){
                    that.gl.screenShot(function(s)
                    {
                        shots.push(s);
                        getShot();    
                    }); },10);
                //html2canvas($C).then(function(canvas)  {  
                //shots.push( $C.get(0).toDataURL());  getShot();   });  
            }








        }
        else if (str == "render" | str == "renderRGB")
        {

            alertify.prompt("Please enter a name", function(e, name) {
                if (e)
                {
                    $(document.body).addClass("wait");
                    setTimeout(function() {
                        saveRenderedVolume(name, str == "renderRGB")
                    }, 100);
                    $(document.body).removeClass("wait");
                }
            });




        }

    }, undefined,false));








    /////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////// crosshair/vew stuff///////////////////////////
    /////////////////////////////////////////////////////////////////////////////////


    function setBBox(bbox)
    {
            if (that.nii == undefined)
                return;
        
            var center = bbox.max.map((x,y) => (x+bbox.min[y])*0.5);   center.push(1)        
            var wid = kmath.max(bbox.max.map((x,y) => (x-bbox.min[y])))
            var zfac = that.$container.width()/wid;
            setZoomLims([zfac]);
            var coords = getCanvasCoordinates(kmath.matrix(center));
            var dy = coords.y_pix+that.heioffs_px*that.zoomFac-$container.height()/2;
            var dx = coords.x_pix+that.widoffs_px*that.zoomFac-$container.width()/2;
            setZoomLims([that.zoomFac, dy, dx]);
            setWorldPosition(center);            
            signalhandler.send('positionChange');
        
            drawHairCross();

    }
    signalhandler.attach("setBBox",setBBox);


    function center(e)
    {

        if (e != undefined && e.viewer)
        {
            if (e.viewer.isFlatMap != that.isFlatMap)
                return;

            if (!(worldLockedToMaster & master.globalCoordinates)
              & e.viewer != that)
               return;                   
        }

        if (!gl_enabled && that.nii != undefined)
        {
            var coords = getCanvasCoordinates(getWorldPosition());
            var dy = coords.y_pix+that.heioffs_px*that.zoomFac-$container.height()/2;
            var dx = coords.x_pix+that.widoffs_px*that.zoomFac-$container.width()/2;
            setZoomLims([that.zoomFac, dy, dx]);
            
         //   setCanvasLayout();
            drawHairCross();
        }

    }
    signalhandler.attach("centralize",center);


    function getReorientationMatrixFromTiltAngles(sg, old_reorient, old_point)
    {
        if (old_point == undefined)
            old_point = getWorldPosition()._data;
        if (old_reorient == undefined)
            old_reorient = that.reorientationMatrix.matrix;

        var xy = sg * Math.sin(-KViewer.currentTilts_(2, 0).v / 180 * Math.PI);
        var xz = sg * Math.sin(-KViewer.currentTilts_(1, 0).v / 180 * Math.PI);
        // 1er + 0er flipped !!!!
        var xx = Math.sqrt(1 - xy * xy - xz * xz);

        var yx = sg * Math.sin(KViewer.currentTilts_(2, 1).v / 180 * Math.PI);
        var yz = sg * Math.sin(-KViewer.currentTilts_(0, 0).v / 180 * Math.PI);
        var yy = Math.sqrt(1 - yx * yx - yz * yz);

        var zy = sg * Math.sin(KViewer.currentTilts_(0, 1).v / 180 * Math.PI);
        var zx = sg * Math.sin(KViewer.currentTilts_(1, 1).v / 180 * Math.PI);
        var zz = Math.sqrt(1 - zy * zy - zx * zx);

        R = math.transpose(math.matrix([[xx, xy, xz, 0], [yx, yy, yz, 0], [zx, zy, zz, 0], [0, 0, 0, 1]]));

        var t = old_point;
        var Q = math.matrix([[1, 0, 0, t[0]], [0, 1, 0, t[1]], [0, 0, 1, t[2]], [0, 0, 0, 1]]);

        var s = math.multiply(math.inv(old_reorient), t);
        var T = math.matrix([[1, 0, 0, s._data[0]], [0, 1, 0, s._data[1]], [0, 0, 1, s._data[2]], [0, 0, 0, 1]]);

        var w = math.multiply((R), t);
        var Z = math.matrix([[1, 0, 0, w._data[0]], [0, 1, 0, w._data[1]], [0, 0, 1, w._data[2]], [0, 0, 0, 1]]);

        return {
            Q: Q,
            T: T,
            R: R,
            Z: Z,
            t: t,
            s: s
        };


    }

    that.getMinVoxSize = function() {
        return math.min(that.nii.voxSize)
    }



    function computeMaxExtentFac()
    {
        var nii = that.nii;
        if (nii == undefined)
        {
            return that.FOV_mm;
        }
        var ext = [nii.sizes[0] * nii.voxSize[0], nii.sizes[1] * nii.voxSize[1], nii.sizes[2] * nii.voxSize[2]];
        var max_extent_perc = Math.max.apply(null , ext);
        return max_extent_perc;
    }
    that.computeMaxExtentFac = computeMaxExtentFac;


    function isBackgroundMoving()
    {
        return KViewer.isMoving(that.currentFileID)
    }
    that.isBackgroundMoving = isBackgroundMoving;


    function getReorientMat(matrix_on_start, point_on_start)
    {
        if (matrix_on_start == undefined)
            matrix_on_start = math.diag([1,1,1,1]);
        if (point_on_start == undefined)
            point_on_start = [0,0,0,1];


        var mv ;
        if (master.viewports[master.mainViewport] == undefined)
            mv = KViewer.findMedViewer(function(mv) { return mv.viewport.hasMouse });
        else
            mv = master.viewports[master.mainViewport].medViewer;

        if (mv == undefined || mv.nii == undefined)        
            return math.diag([1,1,1,1]);

        var mnii = mv.nii
        var edges = mnii.edges;

        var sg = -1;

        var t0 = 1;
        var t1 = 1;
        var t2 = 1;
        if (KViewer.currentTilts_(2, 0).v > 90 | KViewer.currentTilts_(2, 0).v < -90 | 
            KViewer.currentTilts_(1, 0).v > 90 | KViewer.currentTilts_(1, 0).v < -90)
           t0=-1;
        if (KViewer.currentTilts_(2, 1).v > 90 | KViewer.currentTilts_(2, 1).v < -90 |
            KViewer.currentTilts_(0, 0).v > 90 | KViewer.currentTilts_(0, 0).v < -90 )
           t1=-1;
        if ( KViewer.currentTilts_(0, 1).v > 90 | KViewer.currentTilts_(0, 1).v < -90 |
            KViewer.currentTilts_(1, 1).v > 90 | KViewer.currentTilts_(1, 1).v < -90)
           t2=-1;

        var xy = sg * Math.sin(-KViewer.currentTilts_(2, 0).v / 180 * Math.PI);
        var xz = sg * Math.sin(-KViewer.currentTilts_(1, 0).v / 180 * Math.PI);
        var xx = t0*Math.sqrt(1 - xy * xy - xz * xz);

        var yx = sg * Math.sin(KViewer.currentTilts_(2, 1).v / 180 * Math.PI);
        var yz = sg * Math.sin(-KViewer.currentTilts_(0, 0).v / 180 * Math.PI);
        var yy = t1*Math.sqrt(1 - yx * yx - yz * yz);

        var zy = sg * Math.sin(KViewer.currentTilts_(0, 1).v / 180 * Math.PI);
        var zx = sg * Math.sin(KViewer.currentTilts_(1, 1).v / 180 * Math.PI);
        var zz = t2*Math.sqrt(1 - zy * zy - zx * zx);
    

        var R = math.transpose(math.matrix([[xx, xy, xz, 0], [yx, yy, yz, 0], [zx, zy, zz, 0], [0, 0, 0, 1]]));

        edges = math.multiply(edges, permMat(mnii));

        var T = transMat(math.multiply(math.inv(edges), math.multiply(math.inv(matrix_on_start), point_on_start)));

        var E = math.multiply(edges, T);

        return math.multiply(matrix_on_start, math.inv(math.multiply(E, math.multiply(R, math.inv(E)))));


    }

    that.getReorientMat = getReorientMat;

    //////// slice tilting and shifting handler
    haircrossmousehandler = function(Z, type) {
        return function(ev)
        {
            if(ev.button != 0)
                return ;
            
            // always show on move
            if( $(this).css !== undefined)
            {
                var $ccontrol = $(this);
                $ccontrol.addClass('visibility_isvisible');
            }
             

            if ( ( (ev.ctrlKey || type == 'rotator' || type == 'scale') & master.mainViewport === -1) & !ev.shiftKey)
            {
                if (KViewer.navigationMode == 2)
                    master.toggleMainViewport(that.viewport.viewPortID);
                //$.notify("Tilting of image only possible if you choose one viewport as master (m)", "error")
            }

            if ( (ev.ctrlKey || type == 'rotator' || type == 'scale') ) // & master.mainViewport !== -1) // only in coupled mode tilted views are possible
            {



                var matrix_on_start = math.multiply(1, KViewer.reorientationMatrix.matrix);
                var point_on_start = math.multiply(1, getWorldPosition());
                var onset_point = getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY)
                var dif = [point_on_start._data[0]-onset_point._data[0],
                           point_on_start._data[1]-onset_point._data[1],
                           point_on_start._data[2]-onset_point._data[2]];
                var dif_norm = math.sqrt(dif[0]*dif[0]+dif[1]*dif[1]+dif[2]*dif[2])

                ev.preventDefault();
                ev.stopPropagation();
                haircross.start = {
                    X: ev.clientX,
                    Y: ev.clientY
                };
                var coords = getCanvasCoordinates(getWorldPosition());
                var centerX = coords.x_pix + $canvas.offset().left;
                var centerY = coords.y_pix + $canvas.offset().top;
   
                haircross.centerPoint = {
                    X: centerX,
                    Y: centerY
                };
                haircross.start = {
                    X: ev.clientX,
                    Y: ev.clientY,
                    dx: ev.clientX - haircross.centerPoint.X,
                    dy: -ev.clientY + haircross.centerPoint.Y,
                    deg: -Math.atan2(-ev.clientY + haircross.centerPoint.Y, ev.clientX - haircross.centerPoint.X) / Math.PI * 180

                };

                haircross.starttilt = {
                    X: haircross.X.tilt,
                    Y: haircross.Y.tilt
                };

                var rad = 2*(Math.sqrt( haircross.start.dx*haircross.start.dx + haircross.start.dy*haircross.start.dy));
                haircross.C.$circle_rotIndicator.show().width(rad ).height(rad);

                signalhandler.send("clearMultiOutlines")

                /// mousemove event
                $container.on("mousemove", moveUnlagger(function(ev) {

                    var dy = -ev.clientY + haircross.centerPoint.Y;
                    var dx = ev.clientX - haircross.centerPoint.X;
                    var deg2 = -Math.atan2(dy, dx) / Math.PI * 180;
                    
                    deg2 = deg2 - haircross.start.deg

                    // put to interval -180 ...  180
                    if (deg2 > 180)
                        deg2 = deg2 - 360;
                    if (deg2 < -180)
                        deg2 = (deg2 + 360);
                    

                    haircross.X.tilt = deg2;
                    haircross.Y.tilt = deg2;

                    
                    var saveTilt = {
                        X: haircross.X.tilt,
                        Y: haircross.Y.tilt
                    };


                    if (!updateHairCrossTilts(haircross.X.tilt, haircross.Y.tilt))
                    {
                        haircross.X.tilt = saveTilt.X;
                        haircross.Y.tilt = saveTilt.Y;
                    }

                    if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                    {
                        if (type == 'rotator')
                            KViewer.reorientationMatrix.matrix = getReorientMat(matrix_on_start, point_on_start);
                        else
                        {

                            var cp = getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY,undefined,matrix_on_start)
                            var d  = [point_on_start._data[0]-cp._data[0],
                                        point_on_start._data[1]-cp._data[1],
                                        point_on_start._data[2]-cp._data[2]]

                            var T = [[1,0,0,point_on_start._data[0]],
                                    [0,1,0,point_on_start._data[1]],
                                    [0,0,1,point_on_start._data[2]],
                                    [0,0,0,1]]
                            var Ti = [[1,0,0,-point_on_start._data[0]],
                                    [0,1,0,-point_on_start._data[1]],
                                    [0,0,1,-point_on_start._data[2]],
                                    [0,0,0,1]]

                            var nd = math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2])
                            d[0] /= nd; d[1] /= nd; d[2] /= nd;
                            var a = math.pow(dif_norm/nd,0.2);
                            var dd = [  [1-(1-a)*d[0]*d[0] ,-(1-a)*d[0]*d[1]   ,-(1-a)*d[0]*d[2], 0],
                                        [-(1-a)*d[1]*d[0]   ,1-(1-a)*d[1]*d[1] ,-(1-a)*d[1]*d[2], 0],
                                        [-(1-a)*d[2]*d[0]   ,-(1-a)*d[2]*d[1]   ,1-(1-a)*d[2]*d[2], 0 ],
                                        [0,0,0,1] ]
                            var S = math.multiply(T,math.multiply(dd,Ti));
                                        
                            KViewer.reorientationMatrix.matrix = math.multiply(S,matrix_on_start);






                        }
                        KViewer.reorientationMatrix.notID = true;
                    }


                    signalhandler.send("positionChange",{},that.positionChanger);

                }));
                /// mouseup event
                $container.on("mouseup mouseleave", function(ev) {
                    $container.off("mousemove mouseup mouseleave");
                    haircross.C.$circle_rotIndicator.hide();
                    // hide when done
                    if( $ccontrol !== undefined)
                         $ccontrol.removeClass('visibility_isvisible');

                    // call mouseup with "resetHandlersOnly" to true. this wil reset default mousemove
                    mouseManager.mouseup(ev, true);


                    if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                    {
                        if (type == 'rotator')
                        {
                            KViewer.reorientationMatrix.matrix = getReorientMat(matrix_on_start, point_on_start);
                        }
                        KViewer.currentTilts(0, 0).v = 0;
                        KViewer.currentTilts(0, 1).v = 0;
                        KViewer.currentTilts(1, 0).v = 0;
                        KViewer.currentTilts(1, 1).v = 0;
                        KViewer.currentTilts(2, 0).v = 0;
                        KViewer.currentTilts(2, 1).v = 0;

            
                        if (KViewer.mainViewport == 'world') // to update boundix box in worldview
                        {
                        //    KViewer.navigationTool.worldMaster();
                        //    KViewer.toggleMainViewport('world');
                        }


                    }
                    signalhandler.send("positionChange", {
                        mosaicdraw: true
                    },that.positionChanger);



                });
            }
            else if (ev.shiftKey || type == 'mover') /// shifting the slice on grabbing the hc-line
            {
                ev.preventDefault();
                ev.stopPropagation();
                var cpos = $canvas.offset();

                var startx = ev.clientX;
                var starty = ev.clientY;
                // remember offset from haricross center to mouse center
                var hcc = getCanvasCoordinates(getWorldPosition());
                var mcc = getCanvasCoordinates(getRealWorldCoordinatesFromMouseEvent(startx, starty));
                var offx = (mcc.x_pix - hcc.x_pix);
                var offy = (mcc.y_pix - hcc.y_pix);

                var cosa =  Math.cos( haircross.X.tilt / 180*Math.PI );
                var sina =  Math.sin( haircross.X.tilt / 180*Math.PI );

                $container.on("mousemove", moveUnlagger(function(ev) {

                    if (Z.t == "X")
                    {
                        // vector from haircross center to mouse tip
                        var dx =  ev.clientX -startx + offx;
                        var dy =  ev.clientY -starty + offy;
                        // project to rotated X - haircross 
                        var proj = cosa*dx  +  sina*dy ;
                        // calc x and y component along rotated X
                        var xnew = (startx - offx) + proj*cosa ;
                        var ynew = (starty - offy) + proj*sina;
                        xnew = Math.round(xnew);
                        ynew = Math.round(ynew);
                        
                        setWorldPosition(getRealWorldCoordinatesFromMouseEvent(xnew, ynew));
                        var csr = (haircross.X.tilt < 45 || haircross.X.tilt > 90 + 45)?"col-resize":"row-resize"
                    }
                    else
                    {
                        // vector from haircross center to mouse tip
                        var dx =  ev.clientX -startx + offx;
                        var dy =  ev.clientY -starty + offy;
                        // project to rotated Y - haircross 
                        var proj = -sina*dx  +  cosa*dy ;
                        // calc x and y component along rotated X
                        var xnew = (startx - offx) - proj*sina ;
                        var ynew = (starty - offy) + proj*cosa;
                        xnew = Math.round(xnew);
                        ynew = Math.round(ynew);
                        
                        setWorldPosition(getRealWorldCoordinatesFromMouseEvent(xnew, ynew));
                        var csr = (haircross.X.tilt < 45  || haircross.X.tilt > 90 + 45)?"row-resize":"col-resize"
                    }
                    $container.css("cursor", csr);

                    signalhandler.send("positionChange",{},that.positionChanger);

                }));
                /// mouseup event
                $container.on("mouseup mouseleave", function(ev)
                {
                    $container.off("mousemove mouseup mouseleave");
                    $container.css("cursor", "default");

                    // hide when done
                    if( $ccontrol !== undefined)
                         $ccontrol.removeClass('visibility_isvisible');

                    // call mouseup with "resetHandlersOnly" to true. this wil reset default mousemove
                    mouseManager.mouseup(ev, true);

                    signalhandler.send("positionChange", {
                        mosaicdraw: true
                    },that.positionChanger);
                });

            }


        }
        ;
    }
    
    if(0) // haircross old
    {
        haircross.X.lineN.$rot1i.on("mousedown", haircrossmousehandler(haircross.X, 'rotator') );
        haircross.X.lineN.$rot2i.on("mousedown", haircrossmousehandler(haircross.X, 'rotator') );
        haircross.Y.lineN.$rot1i.on("mousedown", haircrossmousehandler(haircross.Y, 'rotator') );
        haircross.Y.lineN.$rot2i.on("mousedown", haircrossmousehandler(haircross.Y, 'rotator') );
    }

    ///////// take the focus blob and tilt the slice
    haircrossfocusmousehandler = function() {
        return function(ev)
        {


            
//            if (master.mainViewport !== -1 & ev.ctrlKey ) // only in coupled mode tilted views are possible
            if (ev.ctrlKey ) // only in coupled mode tilted views are possible
            {

                if ( master.mainViewport === -1)
                {
                    master.toggleMainViewport(that.viewport.viewPortID);
                    //$.notify("Tilting of image only possible if you choose one viewport as master (m)", "error")
                }

                var referencePoint = {
                    X: ev.clientX,
                    Y: ev.clientY
                };
                var matrix_on_start = math.multiply(1, KViewer.reorientationMatrix.matrix);
                var p0 = getRealWorldCoordinatesFromMouseEvent(referencePoint.X, referencePoint.Y)._data;

                var lastX = ev.clientX;
                var lastY = ev.clientY;

                ev.preventDefault();
                ev.stopPropagation();
                //haircross.C.$circle.css("pointer-events", "none");
                $container.on("mousemove", moveUnlagger(function(ev)
                {
                    var movx = -lastX + ev.clientX;
                    var movy = -lastY + ev.clientY;
                    lastX = ev.clientX;
                    lastY = ev.clientY;

                    if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                    {
                        KViewer.reorientationMatrix.matrix = matrix_on_start;
                        var p1 = getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY)._data;
                        var Tmat = math.matrix([[1, 0, 0, p0[0] - p1[0]], [0, 1, 0, p0[1] - p1[1]], [0, 0, 1, p0[2] - p1[2]], [0, 0, 0, 1]]);
                        KViewer.reorientationMatrix.matrix = math.multiply(Tmat, matrix_on_start);
                    }
                    else
                    {

                        if (swapXY)
                        {
                            var tmp = movx;
                            movx = movy;
                            movy = tmp;
                        }
                        if (slicingDimOfArray == 0)
                        {
                            if (validTiltAngles(master.currentTilts(2, 0).v + movx, master.currentTilts(1, 0).v + movy))
                            {
                                master.currentTilts(2, 0).v = master.currentTilts(2, 0).v + movx;
                                master.currentTilts(1, 0).v = master.currentTilts(1, 0).v + movy;
                            }
                        }
                        if (slicingDimOfArray == 1)
                        {
                            if (validTiltAngles(master.currentTilts(2, 1).v + movx, master.currentTilts(0, 0).v + movy))
                            {
                                master.currentTilts(2, 1).v = master.currentTilts(2, 1).v + movx;
                                master.currentTilts(0, 0).v = master.currentTilts(0, 0).v + movy;
                            }
                        }
                        if (slicingDimOfArray == 2)
                        {
                            if (validTiltAngles(master.currentTilts(1, 1).v + movx, master.currentTilts(0, 1).v + movy))
                            {
                                master.currentTilts(1, 1).v = master.currentTilts(1, 1).v + movx;
                                master.currentTilts(0, 1).v = master.currentTilts(0, 1).v + movy;
                            }
                        }
                    }
                    signalhandler.send("positionChange",{},that.positionChanger);

                }));
                /// mouseup event
                $container.on("mouseup mouseleave", function(ev) {
                    $container.off("mousemove mouseup mouseleave");
                    $container.css("cursor", "default");
/*
                    if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                        if (KViewer.mainViewport == 'world') // to update boundix box in worldview
                        {
                            KViewer.navigationTool.worldMaster();
                            KViewer.toggleMainViewport('world');
                        }
*/

                    signalhandler.send("positionChange", {
                        mosaicdraw: true
                    },that.positionChanger);

                ev.stopPropagation();
                return false;
                });

            }
        }
    }
    ;
    //haircross.C.$circle.on("mousedown", haircrossfocusmousehandler());
    
    haircross.C.$circle.on("mousedown", haircrossmousehandler({}, 'rotator') );
    haircross.C.$circle_scaleDot.on("mousedown", haircrossmousehandler({}, 'scale') );
    haircross.C.$circle_center.on("mousedown", haircrossfocusmousehandler());

    function hairfocus_receive_event()
    {
      //  if (1) //!KViewer.MouseInViewport)
       //     return;
        if(markerProxy.currentSet && markerProxy.currentSet.type == 'scribble' && markerProxy.currentSet.state.createonclick)
        {   
            markerProxy.currentSet.markerPanel.toggleModifyScribble(1);
            return
        }    
        haircross.C.$circle.css("pointer-events", "all");             
        if (!gl_enabled & that.currentROI == undefined){
            haircross.C.$circle.css('display', 'inline-block');
        }
    }
    signalhandler.attach("hairfocus_receive_event", hairfocus_receive_event);


    function hairfocus_ignore_event()
    {
        if(markerProxy.currentSet && markerProxy.currentSet.type == 'scribble'  &&  markerProxy.currentSet.state.createonclick)
        {   
            markerProxy.currentSet.markerPanel.toggleModifyScribble(0);
            return
        }    
        haircross.C.$circle.css("pointer-events", "none");             
        if (!gl_enabled & that.currentROI == undefined){
            haircross.C.$circle.css('display', 'none');
        }
    }
    signalhandler.attach("hairfocus_ignore_event", hairfocus_ignore_event);


    function hairfocus_detach_event()
    {

        //haircross.X.lineN.hideRot()
        //haircross.Y.lineN.hideRot()
        haircross.X.lineN.$main.css("pointer-events","none");
        haircross.Y.lineN.$main.css("pointer-events","none");
        haircross.C.$circle.css("pointer-events","none");
        haircross.C.$circle.hide()
    }
    signalhandler.attach("hairfocus_detach_event", hairfocus_detach_event);


    function resetHaircrossTilts()
    {
        haircross.X.tilt = 0;
        haircross.Y.tilt = 0;
        haircross.nX.tilt = 0;
        haircross.nY.tilt = 0;
    }
    signalhandler.attach("resetHaircrossTilts", resetHaircrossTilts);


    function updateHairCrossTilts(X, Y)
    {
        //  if (swapXY)
        //      { var tmp = X; X = Y; Y = tmp; }

        if (slicingDimOfArray == 0)
        {
            if (validTiltAngles(X, master.currentTilts(2, 1).v) & validTiltAngles(Y, master.currentTilts(1, 1).v))
            {
                master.currentTilts(0, 0).v = X;
                master.currentTilts(0, 1).v = Y;
                return true;
            }
        }
        if (slicingDimOfArray == 1)
        {
            if (validTiltAngles(X, master.currentTilts(2, 0).v) & validTiltAngles(Y, master.currentTilts(0, 1).v))
            {
                master.currentTilts(1, 0).v = X;
                master.currentTilts(1, 1).v = Y;
                return true;
            }
        }
        if (slicingDimOfArray == 2)
        {
            if (validTiltAngles(X, master.currentTilts(1, 0).v) & validTiltAngles(Y, master.currentTilts(0, 0).v))
            {
                master.currentTilts(2, 0).v = X;
                master.currentTilts(2, 1).v = Y;
                return true;
            }
        }
        return false;
    }


    function drawHairCross()
    {
        if (that.nii !== undefined & master.crosshairMode & !gl_enabled & (KViewer.zoomedViewport==-1 | that.viewport.isZoomed()))
        {
            showHairCross()

            var edges = that.nii.edges;

            var wp = getWorldPosition();

            // CONGRU
            if ((isBackgroundMoving() & KViewer.mainViewport == -1) | (KViewer.navigationMode == 2 & KViewer.mainViewport == -1) ) 
  //          if (KViewer.navigationTool.isinstance && 
//                (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0) & KViewer.mainViewport == -1))
                     wp = math.multiply(master.reorientationMatrix.matrix, wp);
            
            var coords = getCanvasCoordinates(wp);

            var x = coords.x_pix;
            var y = coords.y_pix;

            var testoffset = -3;// correct one !! never change this!!
            haircross.X.lineN.$main.css({ left: x+testoffset , top: y+testoffset  } );
            haircross.Y.lineN.$main.css({ left: x+testoffset , top: y+testoffset  } );

            // set the distances of the mover / rotator lines
            // --> is done in setCanvasLayout
            
            if (haircross.C.$circle.css('display') == 'none')
            {
                haircross.C.$circle.css('display', 'none');
                haircross.X.lineN.hideRot()
                haircross.Y.lineN.hideRot()
            }

                haircross.X.lineN.$main.css("transform", "rotate(0deg)");
                haircross.Y.lineN.$main.css("transform", "rotate(90deg)");

            //if (master.mainViewport !== -1) 
           // {
                var radX = 0;
                var radY = 0;
                if (slicingDimOfArray == 0)
                {
                    haircross.X.tilt = master.currentTilts(0, 0).v;
                    haircross.Y.tilt = master.currentTilts(0, 1).v;
                    radX = (master.currentTilts(2, 0).v);
                    radY = (master.currentTilts(1, 0).v);
                }
                if (slicingDimOfArray == 1)
                {
                    haircross.X.tilt = master.currentTilts(1, 0).v;
                    haircross.Y.tilt = master.currentTilts(1, 1).v;
                    radX = (master.currentTilts(2, 1).v);
                    radY = (master.currentTilts(0, 0).v);
                }
                if (slicingDimOfArray == 2)
                {
                    haircross.X.tilt = master.currentTilts(2, 0).v;
                    haircross.Y.tilt = master.currentTilts(2, 1).v;
                    radX = (master.currentTilts(1, 1).v);
                    radY = (master.currentTilts(0, 1).v);
                }
                if (swapXY)
                {
                    var tmp = radX;
                    radX = radY;
                    radY = tmp;
                    var tmp = haircross.X.tilt;
                    haircross.X.tilt = haircross.Y.tilt;
                    haircross.Y.tilt = tmp;
                }


                haircross.C.$circle.css({ left: x  + radX,  top: y  + radY });

                if (KViewer.navigationMode == 1)
                {
                    haircross.X.lineN.$main.css("transform", "rotate(" + haircross.X.tilt + "deg) ");
                    haircross.Y.lineN.$main.css("transform", "rotate(" + (haircross.Y.tilt  +90) +"deg) ");
                }
          /*  }
            else
            {

                haircross.C.$circle.css('display', 'none');

                haircross.X.lineN.$main.css("transform", "rotate(0deg)");
                haircross.Y.lineN.$main.css("transform", "rotate(90deg)");
            }*/
        }
        else
            hideHairCross();

    }
    signalhandler.attach("drawHairCross", drawHairCross);

    that.getCanvasCoordinates = getCanvasCoordinates;

    that.matrixcache = {};



    function getCanvasCoordinates(point) // calculates the canvas coordinates in all possible units given a point in real world coordinates
    {

    //    var currentVoxel = math.multiply(math.inv(that.nii.edges), getWorldPosition());

        
        var p;
        if (master.mainViewport !== -1)
        {
            var R = getTiltMat(slicingDimOfArray);
            var M;
            var cacheid = master.reorientationMatrix.matrix._data.toString() + R.toString() + that.nii.edges._data.toString();
            if (that.matrixcache.id != cacheid)
            {
                M = math.multiply(math.inv(R), math.multiply(math.inv(that.nii.edges), math.inv(master.reorientationMatrix.matrix)));
                that.matrixcache = {
                    M: M,
                    id: cacheid
                };
            }
            else
            {
                M = that.matrixcache.M;
            }
            p = math.multiply(M, point)._data;
        }
        else
        {
            if (that.nii.invedges == undefined)
                that.nii.invedges = math.inv(that.nii.edges);
            p = math.multiply( that.nii.invedges , point)._data;

        }
        // voxel coordinates


        var pi;
        if (slicingDimOfArray == 0)
            pi = [1, 2, 0];
        else if (slicingDimOfArray == 1)
            pi = [0, 2, 1];
        else
            pi = [0, 1, 2];




        var c_norm = [0, 0, 0, 1];
        var c_mm = [0, 0, 0, 1];
        var c_size_mm = [0, 0, 0, 1];
        for (var i = 0; i < 3; i++)
        {
            c_norm[i] = (that.nii.arrayReadDirection[pi[i]] == 1) ? (1 - (p[pi[i]] + 0.5) / that.nii.sizes[pi[i]]) : ((p[pi[i]] + 0.5) / that.nii.sizes[pi[i]]);
            c_mm[i] = (p[pi[i]] + 0.5) * that.nii.voxSize[pi[i]];
            c_size_mm[i] = that.nii.voxSize[pi[i]] * that.nii.sizes[pi[i]];
        }

        if (swapXY)
        {
            c_norm = [c_norm[1], c_norm[0], c_norm[2], 1];
            c_size_mm = [c_size_mm[1], c_size_mm[0], c_size_mm[2], 1];
        }


        if (that.mosaicview.active)
        {
            currentSlice = math.round(currentVoxel._data[slicingDimOfArray]);
            var nz = currentSlice;
            if (that.mosaicview.current_readDir == -1)
                nz = that.mosaicview.current_sz_- currentSlice;

            var nv = Math.round((nz - that.mosaicview.z0) / that.mosaicview.dz);
            var x = nv % that.mosaicview.nx;
            var y = Math.floor(nv / that.mosaicview.nx);

            var cp =  that.mosaicview.clipratio            
            c_norm[0] = (c_norm[0] - cp[0])/(cp[2]-cp[0])
            c_norm[1] = (c_norm[1] - cp[1])/(cp[3]-cp[1])

            return {
                x_pix: (x + c_norm[0]) * that.mosaicview.csx_ * $canvas.width() / ctx.canvas.width,
                y_pix: (y + c_norm[1]) * that.mosaicview.csy_ * $canvas.height() / ctx.canvas.height,
                x_norm: c_norm[0],
                y_norm: c_norm[1],
                x_pixPerMM: cwid / c_size_mm[0],
                y_pixPerMM: chei / c_size_mm[1],
                z_mm: c_mm[2]
            };


        }

        var cwid = $canvas.width() * that.embedfac_width;
        var chei = $canvas.height() * that.embedfac_height;


        return {
            x_pix: c_norm[0] * cwid,
            y_pix: c_norm[1] * chei,
            x_norm: c_norm[0],
            y_norm: c_norm[1],
            x_pixPerMM: cwid / c_size_mm[0],
            y_pixPerMM: chei / c_size_mm[1],
            z_mm: c_mm[2]
        };
    }

    that.getRealWorldCoordinatesFromMouseEvent = getRealWorldCoordinatesFromMouseEvent;
    function getRealWorldCoordinatesFromMouseEvent(clientX, clientY, structuredOutput,reorientationMatrix) // calculates the real world coords from pixel coordinates. 
    {
        clientY += window.pageYOffset;
        clientX += window.pageXOffset;
        // 1/2 pixel correction
        if (swapXY)        
        {
            var offY = 0.5 / ctx.canvas.width / that.embedfac_width;
            var offX = 0.5 / ctx.canvas.height / that.embedfac_height;
        }
        else
        {
            var offX = 0.5 / ctx.canvas.width / that.embedfac_width;
            var offY = 0.5 / ctx.canvas.height / that.embedfac_height;
        }
        


        var cpos = $canvas.offset();
        var X = clientX - cpos.left;
        // position on canvas
        var Y = clientY - cpos.top;
        // position on canvas

        var x_norm, y_norm;
        var voxelCoordinates = currentVoxel._data.slice(0);
        if (that.mosaicview.active)
        {
            var wx = $canvas.width() / that.mosaicview.nx;
            var wy = $canvas.height() / that.mosaicview.ny_div;
            var vx = Math.floor(X / wx);
            var vy = Math.floor(Y / wy);
            x_norm = X / wx - vx;
            y_norm = Y / wy - vy;
            
            var cp =  that.mosaicview.clipratio            
            x_norm = x_norm*(cp[2]-cp[0]) + cp[0]
            y_norm = y_norm*(cp[3]-cp[1]) + cp[1]


            voxelCoordinates[slicingDimOfArray]
                = (that.mosaicview.z0 + (vy * that.mosaicview.nx + vx) * that.mosaicview.dz);
            if (that.mosaicview.current_readDir == -1)
                voxelCoordinates[slicingDimOfArray] = that.mosaicview.current_sz_ - voxelCoordinates[slicingDimOfArray];
        }
        else
        {
            x_norm = X / $canvas.width() / that.embedfac_width;
            // must add one half pixel
            y_norm = Y / $canvas.height() / that.embedfac_height;
        }

        if (swapXY)
        {
            var tmp = x_norm;
            x_norm = y_norm;
            y_norm = tmp;
        }


        var perm = that.nii.permutationOrder;
        var pi;
        if (slicingDimOfArray == 0)
            pi = [1, 2, 0];
        else if (slicingDimOfArray == 1)
            pi = [0, 2, 1];
        else
            pi = [0, 1, 2];

        voxelCoordinates[pi[0]] = (that.nii.arrayReadDirection[pi[0]] == 1) ? ((1 - x_norm - offX) * that.nii.sizes[pi[0]]) : ((x_norm - offX) * that.nii.sizes[pi[0]]) ;
        voxelCoordinates[pi[1]] = (that.nii.arrayReadDirection[pi[1]] == 1) ? ((1 - y_norm - offY) * that.nii.sizes[pi[1]]) : ((y_norm - offY) * that.nii.sizes[pi[1]]);

        var realWorldCoordinates;
        if (master.mainViewport !== -1)
        {
            if (reorientationMatrix == undefined)
              reorientationMatrix = master.reorientationMatrix.matrix
            var R =  (getTiltMat(slicingDimOfArray));
            realWorldCoordinates = math.multiply(that.nii.edges, math.multiply(R, voxelCoordinates));
            realWorldCoordinates = math.multiply(reorientationMatrix, realWorldCoordinates);
        }
        else
        {
            realWorldCoordinates = math.multiply((that.nii.edges), voxelCoordinates);
        }
        if(structuredOutput)
            return {realWorldCoordinates:realWorldCoordinates, voxelCoordinates:voxelCoordinates} ;
        else
            return realWorldCoordinates;

    }


    function hideHairCross()
    {
        haircross.C.$circle.css({ display: "none" });
        haircross.X.lineN.$main.hide();
        haircross.Y.lineN.$main.hide();
    }
    function showHairCross()
    {
        haircross.X.lineN.$main.show();
        haircross.Y.lineN.$main.show();
    }
    
    that.toggleHairCrossControls  = function( state )
    {
        haircross.X.lineN.toggleControls( state );
        haircross.Y.lineN.toggleControls( state );
    }





    function validTiltAngles(a, b)
    {
        var s1 = Math.sin(a / 180 * Math.PI);
        var s2 = Math.sin(b / 180 * Math.PI);
        if (s1 * s1 + s2 * s2 + myeps >= 1)
            return false;
        else
            return true;
    }




    /////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////// clims histo  /////////////////////////////////

    that.createHistoManager = createHistoManager;
    function createHistoManager(parentviewbar)
    {
        /**  @class 
	     *  @alias KHistoManager */
        var histoman = new Object();
        histoman.nii = undefined;
        histoman.parentviewbar = parentviewbar;
        histoman.clim = [0, 1];
        histoman.clim_manually_modified = false;
        histoman.mode = 0;
        histoman.gamma = 1;
        histoman.blending = true;
        histoman.posnegsym = false;
        histoman.dither = 0;
        histoman.slab_projection_type = "mip";
        histoman.slab = 0;
        histoman.blocky = false;
        histoman.cmapindex = 0;
        histoman.onclimchange = undefined;
        that.histoManagercnt++;


        histoman.getManuallyEnteredClim = function(force)
        {
            if (force | histoman.clim_manually_modified)
            {
                var clim0 = histoman.nii.datascaling.e(histoman.clim[0])
                var clim1 = histoman.nii.datascaling.e(histoman.clim[1])                
                return [clim0,clim1];
            }
            else
                return undefined;
        }


        histoman.whichSettings = ["cmapindex","blocky","blending","dither","gamma","posnegsym","clim","transfactor"]
        histoman.saveSettings = function()
        {
            if (KMedViewer.histoSettings == undefined)
                KMedViewer.histoSettings = {};
            
            var settings = KMedViewer.histoSettings;
            
            var id = histoman.parentviewbar.currentFileID + histoman.parentviewbar.type;
            settings[id] = {}
            for (var k in histoman.whichSettings)
                {
                    var fname = histoman.whichSettings[k]
                    settings[id][fname] = histoman[fname]
                }
        }
        
        histoman.loadSettings = function(imageStruct)
        {
            if (KMedViewer.histoSettings == undefined)
                KMedViewer.histoSettings = {};
            
            var settings = KMedViewer.histoSettings;
            var id = histoman.parentviewbar.currentFileID + histoman.parentviewbar.type;

            if (settings[id] != undefined)
            {
                for (var k in histoman.whichSettings)
                {
                    var fname = histoman.whichSettings[k]
                    histoman[fname] = settings[id][fname];
                }                
            }
            
        }

        var $histogramdiv = $("<div class='histogram'><div class='histoname'><div></div></div><svg height=40 width=120>" +
        " <polygon points='' style='fill:yellow;stroke:purple;stroke-width:1' />   "+
        " <line stroke='black'/>  </svg></div>")

        var $histoname = $($histogramdiv.find(".histoname").children()[0]);
        if ($topRow.find(".histogram").length > 0)
        {
            var hists = $topRow.find(".histogram");
            $histogramdiv.insertAfter($(hists[hists.length - 1]));
        }
        else
            $histogramdiv.appendTo($topRow);
        
        //$histogramdiv.on("contextmenu", function(ev){histoman.cmapSelectorMenu(ev)} );


        var $climL = $("<div class='clim'><div class='climL'></div></div>").appendTo($histogramdiv);
        var $climR = $("<div class='clim'><div class='climR'></div></div>").appendTo($histogramdiv);
        var $climLtxt = $("<div contenteditable='true' class='climtxt climhistotxt' style='top:5%'></div>").appendTo($histogramdiv);
        var $climRtxt = $("<div contenteditable='true' class='climtxt climhistotxt'></div>").appendTo($histogramdiv);
        $climLtxt.on('focus', function() {  setTimeout(function() { document.execCommand('selectAll', false, null)  }, 0); })
        $climRtxt.on('focus', function() {  setTimeout(function() { document.execCommand('selectAll', false, null)  }, 0); })

        var climDivs = {
            L: {
                div: $climLtxt,
                t: 'L'
            },
            R: {
                div: $climRtxt,
                t: 'R'
            }
        };






        histoman.cmapSelectorMenu = KContextMenu(
        function() {
            var $menu = $("<ul class='menu_context small'>");
            $menu.append($("<hr width='100%'> "));
            if ((!histoman.parentviewbar.showcolored | histoman.parentviewbar.showcolored_type == "SOS"))
            {
                $menu.append($("<span> &nbsp Colormapping  </span>"));
                $menu.append($("<hr width='100%'> "));
                for (var k = 0; k < colormap.names.length; k++)
                {
                    if (histoman.cmapindex == k)
                        $menu.append($("<li onchoice='" + k + "' > " + colormap.names[k] + "<i class='fa fa-dot-circle-o'></i>  </li>"));
                    else
                        $menu.append($("<li onchoice='" + k + "' > " + colormap.names[k] + "<i class='fa fa-circle-o'></i> </li>"));
                    //if (k == colormap.names.length - 3)
                    //    $menu.append($("<hr>"));
                }
            $menu.append($("<hr>"));
            }

             if (histoman.parentviewbar.nii && histoman.parentviewbar.nii.sizes[3]%3 == 0)
            {
                var sel = histoman.parentviewbar.showcolored ? 'check-' : '';
                var type = histoman.parentviewbar.showcolored_type;
                $menu.append($("<li onchoice='rgbinterpret' > RGB interpret <i class='fa fa-caret-right'></i> <ul> " +
                "<li onchoice='rgbinterpret' > colored <i  onchoice='lock' class='fa fa-"+sel+"square-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_raw' > raw <i onchoice='lock' class='fa fa-"+((type=="raw") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_RGB' > RGB <i onchoice='lock' class='fa fa-"+((type=="RGB") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_BRG' > BRG <i onchoice='lock' class='fa fa-"+((type=="BRG") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_GBR' > GBR <i onchoice='lock' class='fa fa-"+((type=="GBR") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_GRB' > GRB <i onchoice='lock' class='fa fa-"+((type=="GRB") ? 'check-' : '')+"circle-o'></i> </li>" +
                "<li onchoice='type_rgbinterpret_SOS' > SOS <i onchoice='lock' class='fa fa-"+((type=="SOS") ? 'check-' : '')+"circle-o'></i> </li>"));

            }


            var clim0 = histoman.nii.datascaling.e(histoman.clim[0])
            var clim1 = histoman.nii.datascaling.e(histoman.clim[1])


            var step = (clim1-clim0)/50;
            var $clim_L = $("<input class='inputclim_contextmenu' onchoice='preventSelection' type='number' step='"+step+"'>").val(clim0).
                     on('change', function(ev) {
                            var $input = $(ev.target);
                            histoman.clim[0] = histoman.nii.datascaling.ie($input.val());
                            histoman.onclimchange(ev);
                   });
            var $clim_R = $("<input  class='inputclim_contextmenu' onchoice='preventSelection' type='number' step='"+step+"'>").val(clim1).
                     on('change', function(ev) {
                            var $input = $(ev.target);
                            histoman.clim[1] = histoman.nii.datascaling.ie($input.val());
                            histoman.onclimchange(ev);                
                   });
            $menu.append($("<li  onchoice='preventSelection'> col. limits: </li>").append($clim_L).append($clim_R));
            

            $menu.append($("<hr width='100%'> "));

            if (histoman.blending != undefined)
            {
                if (histoman.blending == 0)
                    $menu.append($("<li onchoice='blending' > Transparent <i class='fa fa-square-o'></i> </li>"));
                else
                {
                    if (that.transfactor == undefined)
                        that.transfactor = 1;
                    $menu.append($("<li onchoice='noblending' > Transparent  <i class='fa fa-check-square-o'></i> </li>"));
                    var $factor = $("<input onchoice='preventSelection' type='number' step='0.05' min='0' max='1'>").val(  that.transfactor).
                             on('change', function(ev) {
                            var $input = $(ev.target);
                             that.transfactor = $input.val();
                              that.drawSlice({
                            mosaicdraw: true
                            });
                            histoman.saveSettings();
                                 
                           });
                    $menu.append($("<li  onchoice='preventSelection'> opacity: </li>").append($factor));

                }
            }


            if (histoman.posnegsym != undefined)
            {
                if (!histoman.posnegsym)
                    $menu.append($("<li onchoice='posnegsym' > For Z/T-values <i class='fa fa-square-o'></i> </li>"));
                else
                    $menu.append($("<li onchoice='noposnegsym' > For Z/T-values  <i class='fa fa-check-square-o'></i> </li>"));
            }

            if (histoman.dither != undefined)
            {
    
               var $dither = $("<input onchoice='preventSelection' type='number' step='0.02' min='0' max='1'>").val(histoman.dither).
                     on('change', function(ev) {
                    var $input = $(ev.target);
                    histoman.dither = $input.val();
                      that.drawSlice({
                    mosaicdraw: true
                    });
                    histoman.saveSettings();
                   });
               $menu.append($("<li  onchoice='preventSelection'> dither: </li>").append($dither));

            }

            
            var $gamma = $("<input onchoice='preventSelection' type='number' step='0.05' min='0' max='10'>").val(histoman.gamma).
                     on('change', function(ev) {
                    var $input = $(ev.target);
                    histoman.gamma = $input.val();
                      that.drawSlice({
                    mosaicdraw: true
                    });
                    histoman.saveSettings();
                         
                   });
            $menu.append($("<li  onchoice='preventSelection'> gamma: </li>").append($gamma));

            if (histoman.parentviewbar.type == "mainview")
            {
                var $slabopt = $(" <span>&nbsp&nbsp avg:</span><input onchoice='preventSelection' type='checkbox'>").
                         on('change', function(ev) {
                         var $input = $(ev.target);
                         if ($input[0].checked)
                             histoman.slab_projection_type = "avg"
                         else
                             histoman.slab_projection_type = "mip"                         
                         that.drawSlice({  mosaicdraw: true    });
                         histoman.saveSettings();
                            
                       });
                
                if (histoman.slab_projection_type == "avg")
                    $slabopt[1].checked = 1;
                var $slab = $("<input onchoice='preventSelection' type='number' step='1' min='0' max='20'>").val(histoman.slab).
                         on('change', function(ev) {
                        var $input = $(ev.target);
                        histoman.slab = $input.val();
                          that.drawSlice({
                          mosaicdraw: true
                        });
                        histoman.saveSettings();
                             
                       });
                $menu.append($("<li  onchoice='preventSelection'> slab size: </li>").append($slab).append($slabopt));
            }
            if (histoman.blocky != undefined)
            {
                if (histoman.blocky)
                    $menu.append($("<li onchoice='blocky' > Trilinear interpolation <i class='fa fa-square-o'></i> </li>"));
                else
                    $menu.append($("<li onchoice='noblocky' > Trilinear interpolation <i class='fa fa-check-square-o'></i> </li>"));
            }




            $menu.append($("<hr width='100%'> "));
            $menu.append($("<span> &nbsp Windowing  </span>"));
            $menu.append($("<hr width='100%'> "));

            
            
            // contrast presets (for CT mainly)
            var p = colormap.colorlimpresets;
            for(var k=0; k < p.length;  k++)
                $menu.append($("<li onchoice='reset' data-min='"+ p[k].min +"' data-max='"+ p[k].max +"'  > "+ p[k].title +" </li>"));    
            
            return $menu;
        },
        function(str, ev)
        {
           
            if (str)
            {
                if (str != "")
                {
                    if (str == 'reset')
                    {
                        resetColorMapLims( [ $(ev.target).attr('data-min'), $(ev.target).attr('data-max')  ]   );
                    }
                    else if (str == "posnegsym")
                        histoman.posnegsym = true;
                    else if (str == "noposnegsym")
                        histoman.posnegsym = false;
                    else if (str == "blending")
                        histoman.blending = true;
                    else if (str == "noblending")
                        histoman.blending = false;
                    else if (str == "blocky")
                        histoman.blocky = false;
                    else if (str == "noblocky")
                        histoman.blocky = true;
                    else if (str == 'rgbinterpret')
                    {
                         histoman.parentviewbar.showcolored = !histoman.parentviewbar.showcolored;
                         signalhandler.send("updateImage",{id:histoman.parentviewbar.currentFileID});  
                         updateHistogramClim();              
                    }
                    else if (str.substring(0,17) == 'type_rgbinterpret')
                    {
                        histoman.parentviewbar.showcolored_type = str.substring(18);
                        signalhandler.send("updateImage",{id:histoman.parentviewbar.currentFileID});                
                    }

                    else
                    {
                        if (colormap.names[str] == "unicolor")
                        {
                            if (histoman.parentviewbar.color == undefined)
                                histoman.parentviewbar.color = 0;
                            var colors = KColor.list;
                            function colencode(c) {
                                return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
                                }
                              var $colselector = KColorSelector(colors, colencode,
                                function() {      
                                    histoman.setCmap("uni"+histoman.parentviewbar.color);   
                                    if (histoman.oncmapchange)
                                        histoman.oncmapchange();
                                    that.drawSlice({
                                        mosaicdraw: true
                                    });
                               
                                }, histoman.parentviewbar);

                            $colselector.themenu(ev);
                            return "close";
                          

                        }
                        else
                            histoman.setCmap(parseInt(str));

                    }
                    histoman.saveSettings();
                    
                    if (!ev.shiftKey & histoman.oncmapchange != undefined)
                        histoman.oncmapchange();
                }
                that.drawSlice({
                    mosaicdraw: true
                });
            }
        }, undefined, true
        );




        var $colorbardiv = $("<div class='colorbar'></div>")
        var $colorbarcanvas = $("<canvas  style='height:100%;width:100%'></canvas>").appendTo($colorbardiv)
            .click(histoman.cmapSelectorMenu)
            .on("contextmenu", histoman.cmapSelectorMenu);
        if ($topRow.find(".colorbar").length > 0)
        {
            var cdivs = $topRow.find(".colorbar");
            $colorbardiv.insertAfter($(cdivs[cdivs.length - 1]));
        }
        else
            $colorbardiv.appendTo($topRow);

        var cbarctx = $colorbarcanvas.get(0).getContext("2d");

        var $cbarLtxt = $("<div contenteditable='true'  class='climtxt'></div>").appendTo($colorbardiv);
        var $cbarRtxt = $("<div contenteditable='true'  class='climtxt'></div>").appendTo($colorbardiv);
        $cbarLtxt.on('focus', function() {  setTimeout(function() { document.execCommand('selectAll', false, null)  }, 0); })
        $cbarRtxt.on('focus', function() {  setTimeout(function() { document.execCommand('selectAll', false, null)  }, 0); })

        
        var oncbartextchange = function(ev) { return climTextChange(ev,$cbarLtxt,$cbarRtxt) };
        $cbarLtxt.keyup( oncbartextchange);
        $cbarRtxt.keyup(oncbartextchange);
        $cbarLtxt.blur(oncbartextchange);
        $cbarRtxt.blur(oncbartextchange);

        //makeEditableOnDoubleClick($cbarLtxt);
        //makeEditableOnDoubleClick($cbarRtxt);


        function remove()
        {
            that.histoManagercnt--;
            $colorbardiv.remove();
            $histogramdiv.remove();
            $climL.remove();
            $climR.remove();
            $climLtxt.remove();
            $climRtxt.remove();
            signalhandler.detach("layoutHisto", sig_layout_id);

        }
        histoman.remove = remove;

        function hide()
        {
            $histogramdiv.hide();
            $colorbardiv.hide();
        }
        histoman.hide = hide;

        function hideHisto()
        {
            $histogramdiv.hide();
        }
        histoman.hideHisto = hideHisto;

        function hideCbar()
        {
            $colorbardiv.hide();
        }
        histoman.hideCbar = hideCbar;
        signalhandler.attach("hideHistoOnly", histoman.hideHisto);


        climtxtchange = function(ev) { return climTextChange(ev,$climLtxt,$climRtxt) };

        function climTextChange(ev,$ltxt,$rtxt)
        {

            // remove focus on enter; this will also take care of clim change
            if( ev.keyCode == 13)
            {
                if(ev.target == $ltxt.get(0))
                    $ltxt.blur();
                if(ev.target == $rtxt.get(0))
                    $rtxt.blur();

                window.getSelection().removeAllRanges();
                return false;
            }

            if ( ev.type == "blur")
            {
                var ds = histoman.nii.datascaling;
                if (ds == undefined)
                {
                    ds = {ie :function(x) {
                        return x
                    } };
                    
                }
                if (ds.ie != undefined)
                {
                    var l = ds.ie(parseFloat($ltxt.text()));
                    var r = ds.ie(parseFloat($rtxt.text()));
                }
                else
                {
                    var l = (parseFloat($ltxt.text()));
                    var r = (parseFloat($rtxt.text()));
                }
                
                if (!isNaN(l))
                    histoman.clim[0] = l;
                if (!isNaN(r))
                    histoman.clim[1] = r;
                updateHistogramClim();
                
                if (ev.shiftKey)
                    histoman.setColorMapLims(histoman.clim);
                else
                    histoman.onclimchange(ev);
                
                window.getSelection().removeAllRanges();
                return false;

            }
            return true;
        }



        signalhandler.attach("datascalingChanged", function(ev) {
            if (histoman.nii)
            {
               if (that.content.fileID == ev.id)
                climtxtchange({keyCode:13}); 
            }

             } );
        $climLtxt.keyup(climtxtchange);
        $climRtxt.keyup(climtxtchange);
        $climLtxt.blur(climtxtchange);
        $climRtxt.blur(climtxtchange);

        // this is the mousedwon handler
        climhandler = function(Z, setInitial) {
            return function(ev)
            {
                
                // set on click
                if(setInitial)
                {
                    if($(ev.target).hasClass('climtxt'))
                    {
                        return true;
                    }

                    var d = ev.clientX - $histogramdiv.offset().left;
                    //if (ev.which == 1)
                    if(  (ev.clientY -  $histogramdiv.offset().top)/ $histogramdiv.height() > .5)
                    {
                        if(ev.which == 1)
                        {
                            histoman.clim[0] = histoman.nii.histogram.min + d / $histogramdiv.width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                            Z = climDivs.L
                        }
                        else if(ev.which == 3)
                        {
                            histoman.clim[1] = histoman.nii.histogram.min + d / $histogramdiv.width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                            Z = climDivs.R
                        }
                        updateHistogramClim();
                    }
                    else
                    {
                        if(ev.which == 3)
                        {
                            histoman.cmapSelectorMenu(ev)                        
                        }
                        return false;
                    } 

                }


                var referencePoint = {
                    X: ev.clientX,
                    Y: ev.clientY
                };
                var referenceLims = [histoman.clim[0], histoman.clim[1]];

                ev.preventDefault();
                ev.stopPropagation();
                Z.div.css("pointer-events", "none");
                $(document.body).on("mousemove", moveUnlagger(function(ev)
                {
                    var d = (ev.clientX - referencePoint.X);
                    if (Z.t == "L")
                    {
                        histoman.clim[0] = referenceLims[0] + d / Z.div.parent().width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                        // old version with mov
                        //histoman.clim[0] = histoman.clim[0] + mov(ev).X/Z.div.parent().width()*(histoman.nii.histogram.max-histoman.nii.histogram.min);
                    }
                    else
                    {
                        histoman.clim[1] = referenceLims[1] + d / Z.div.parent().width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                    }
                    //  setColorMapLims(histoman.clim);
                    updateHistogramClim();
                    $(document.body).css("cursor", "ew-resize");
                    if (ev.shiftKey)
                        histoman.setColorMapLims(histoman.clim);
                    else
                        histoman.onclimchange(ev);

                }));
                /// mouseup event
                $(document.body).on("mouseup mouseleave", function(ev) {
                    $(document.body).off("mousemove mouseup mouseleave");
                    $(document.body).css("cursor", "default");
                    Z.div.css("pointer-events", "all");
                    histoman.clim_manually_modified = true;
                    if (ev.shiftKey)
                        histoman.setColorMapLims(histoman.clim);
                    else
                    {
                        histoman.onclimchange(ev);
                    }
                });
            }
        }

        $climL.on("mousedown", climhandler(climDivs.L));
        $climR.on("mousedown", climhandler(climDivs.R));
        $histogramdiv.on("mousedown", climhandler(climDivs.L, 1));

/*
        $histogramdiv.on("mousedown", 
            function(Z) {
            return function(ev)
            {
                var d = ev.clientX - $histogramdiv.offset().left;
                if (1)//ev.which == 1)
                    histoman.clim[0] = histoman.nii.histogram.min + d / $histogramdiv.width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                else if (ev.which == 2)
                    histoman.clim[1] = histoman.nii.histogram.min + d / $histogramdiv.width() * (histoman.nii.histogram.max - histoman.nii.histogram.min);
                 updateHistogramClim();
                 //$climL.trigger('mousedown')

            }
            }(climDivs.L))
*/


//         $histogramdiv.on("mousedown", function(ev){
//             var x = ev.clientX - $histogramdiv.offset().left;
//             climhandler(climDivs.L)
//             console.log(x)

//             } );


        function setCmap(cmap)
        {
            if (typeof (cmap) == "string" | cmap >=100) 
            {
                if (typeof (cmap) == "string" && cmap.substring(0,3) == "uni")
                {
                    histoman.parentviewbar.color = parseInt(cmap.substring(3));  
                    histoman.cmapindex = 100 + histoman.parentviewbar.color                    
                    histoman.mode = 0;                 
                    updateHistogramClim();
                    return;

                }
                else
                {
                    histoman.parentviewbar.color = cmap-100;
                    cmap = colormap.mapIndex(cmap);
                }

            }

            histoman.cmapindex = cmap;
            if (cmap >= 100)
                histoman.mode = 0;
            else if (cmap >= colormap.names.length - 2)
                histoman.mode = cmap - colormap.names.length + 3;
            else
                histoman.mode = 0;

            updateHistogramClim();
        }
        histoman.setCmap = setCmap;

        function updateClimTxt()
        {
            var d = histoman.nii.datascaling;
            if (d.e == undefined)
                d.e = function(x) {
                    return x
                }
            function render(a)
            {
                a = d.e(a);
                if (Math.abs(a)<0.0000001)
                    return "0";
                var dig = Math.log10(Math.abs(a))
                if (dig > 2)
                    return a.toFixed(0);
                else if (dig > 0)
                    return a.toFixed(1);
                else if (dig > -4)
                    return a.toFixed(1+Math.ceil(Math.abs(dig)));
                else                
                    return a.toFixed(6);
            }

            $climLtxt.text(render(histoman.clim[0]))
            $climRtxt.text(render(histoman.clim[1]))
            $cbarLtxt.text(render(histoman.clim[0]))
            $cbarRtxt.text(render(histoman.clim[1]))

        }


        function updateHistogramClim()
        {
            if (histoman.nii)
                if (histoman.nii.histogram)
                {
                    var hwid = $histogramdiv.width();
                    $climLtxt.css("height", 0);
                    $climRtxt.css("height", 0);

                    $climL.css("left", hwid * (histoman.clim[0] - histoman.nii.histogram.min) / (histoman.nii.histogram.max - histoman.nii.histogram.min));
                    $climR.css("left", hwid * (histoman.clim[1] - histoman.nii.histogram.min) / (histoman.nii.histogram.max - histoman.nii.histogram.min));
                    $climLtxt.css("left", hwid * (histoman.clim[0] - histoman.nii.histogram.min) / (histoman.nii.histogram.max - histoman.nii.histogram.min));
                    $climRtxt.css("left", hwid * (histoman.clim[1] - histoman.nii.histogram.min) / (histoman.nii.histogram.max - histoman.nii.histogram.min));

                    updateClimTxt();

                    if (histoman.clim[0] < histoman.nii.histogram.min)
                    {
                        $climL.css("left", 0);
                        $climLtxt.css("left", 0);
                    }
                    if (histoman.clim[1] > histoman.nii.histogram.max)
                    {
                        $climR.css("left", hwid);
                        $climRtxt.css("left", hwid);
                    }
                    $climL.css("display", "inline-block");
                    if (histoman.mode == 0)
                    {
                        $climR.css("display", "inline-block");
                        $climRtxt.css("display", "inline-block");
                    }
                    else
                    {
                        $climR.css("display", "none");
                        $climRtxt.css("display", "none");
                    }




                    if (colormap.maps[histoman.cmapindex])
                    {

                        if (histoman.parentviewbar != undefined && histoman.parentviewbar.showcolored)
                        {
                            var n = 20;
                            var cbardata = cbarctx.createImageData(3, n);
                            for (var k = 0; k < n; k++)
                            {
                                var v = k/n*255;
                                cbardata.data[3*4 * k] = v
                                cbardata.data[3*4 * k + 1] = 0
                                cbardata.data[3*4 * k + 2] = 0
                                cbardata.data[3*4 * k + 3] = 255;
                                cbardata.data[3*4 * k + 4] = 0
                                cbardata.data[3*4 * k + 5] = (255-v);
                                cbardata.data[3*4 * k + 6] = 0
                                cbardata.data[3*4 * k + 7] = 255;
                                cbardata.data[3*4 * k + 8] = 0
                                cbardata.data[3*4 * k + 9] = 0
                                cbardata.data[3*4 * k + 10] = v
                                cbardata.data[3*4 * k + 11] = 255;
                            }

                            cbarctx.canvas.width = 3;
                            cbarctx.canvas.height = n;
                        }
                        else
                        {
                            var cbardata = cbarctx.createImageData(1, colormap.maps[histoman.cmapindex][0].length);                         
                            for (var k = 0; k < colormap.maps[histoman.cmapindex][0].length; k++)
                            {
                                cbardata.data[4 * k] = colormap.maps[histoman.cmapindex][0][colormap.maps[histoman.cmapindex][0].length - k - 1];
                                cbardata.data[4 * k + 1] = colormap.maps[histoman.cmapindex][1][colormap.maps[histoman.cmapindex][0].length - k - 1];
                                cbardata.data[4 * k + 2] = colormap.maps[histoman.cmapindex][2][colormap.maps[histoman.cmapindex][0].length - k - 1];
                                cbardata.data[4 * k + 3] = 255;
                            }
                            cbarctx.canvas.width = 1;
                            cbarctx.canvas.height = colormap.maps[histoman.cmapindex][0].length;
                        }


                        cbarctx.putImageData(cbardata, 0, 0);
                    }
                }
        }
        histoman.updateHistogramClim = updateHistogramClim;


        function layoutHistogram()
        {
            if (histoman.nii == undefined)
                return;

            var histoSizeFac = state.viewer.histoSizeFac;
            // layout histogram
            var pwid = $container.width();
            if (pwid > $container.height())
                pwid = $container.height();
            pwid *= 1.5;


            var hwid = pwid * 0.3 * histoSizeFac;
            var hhei = pwid * 0.1 * histoSizeFac;

            if ((hwid+35)*that.histoManagercnt > $container.width())
            {
                 histoSizeFac = ($container.width()/that.histoManagercnt -35)/(pwid * 0.3)
                 hwid = pwid * 0.3 * histoSizeFac;
                 hhei = pwid * 0.1 * histoSizeFac;        
            }



            var left = 2;
            if ($histogramdiv.prev().hasClass("histogram"))
            {
                var hists = $histogramdiv.parent().find(".histogram");
                for (var k = 0; k < hists.length;k++)
                {
                    if (hists[k] == $histogramdiv[0])
                    {
                        left = $(hists[0]).position().left + k*(hwid+35);                        
                    }
                }
//                left = $histogramdiv.prev().position().left + hwid + 35;
            }
            $histogramdiv.css({
                display: "inline-block",
                left: left,
                width: hwid,
                height: hhei
            });
            $histogramdiv.find("svg").width(hwid);
            $histogramdiv.children().height(hhei);


            // layout colorbar
            var hwid = $container.width() * 0.04 * histoSizeFac;
            if (hwid > 25)
                hwid = 25;
            if (hwid < 17)
                hwid = 17;
            var hhei = 50; //$container.height() * 0.2 * histoSizeFac;
            var left = 5; //$container.width() * 0.04;
            var top = $container.height() * 0.25;
            if ($colorbardiv.prev().hasClass("colorbar"))
            {
                top = top + hhei + $container.height() * 0.1;
                
                var cbars = $colorbardiv.parent().find(".colorbar");

                for (var k = 1; k < cbars.length;k++)
                    if (cbars[k] == $colorbardiv[0])
                    {
                        left = left + (k-1)*(hwid*1.7);                        
                    }

            }

            $colorbardiv.css({
                display: "inline-block",
                left: left,
                top: top,
                width: hwid,
                height: hhei
            });

            if (histoman.hidden | that.hiddenHisto)
                 $colorbardiv.css({ display: "none"})

            $colorbardiv.children().first().width(hwid);
            $colorbardiv.children().height(hhei);

            $cbarRtxt.css("top", -18);
            $cbarRtxt.css("left", '-50%', 'transform', 'translate -50%');
            $cbarLtxt.css("top", hhei);
            $cbarLtxt.css("left", '-50%', 'transform', 'translate -50%');




            updateHistogram();
            updateHistogramClim();
        }
        histoman.layoutHistogram = layoutHistogram;
        var sig_layout_id = signalhandler.attach("layoutHisto", layoutHistogram);


        function updateHistogram()
        {
            if (histoman.nii != undefined && that.viewport.barport == undefined)
            {
                if (master.histoMode != 0)
                {
                    if (master.histoMode == 2 & that.overlays.length > 0)
                    {
                        histoman.hide();
                        return;
                    }
                    // 2 means main image only
                    if (master.histoMode == 3 & that.overlays.length == 0) // 3 means overlay image only
                    {
                        histoman.hide();
                        return;
                    }
                    if (histoman.hidden  | that.hiddenHisto)
                        $histogramdiv.css({
                            display: "none"
                        });
                    else
                        $histogramdiv.css({
                            display: "inline-block"
                        });
                    var histoheight = $histogramdiv.height();
                    var histowidth = $histogramdiv.width();

                    var $line = $histogramdiv.find("line");
                    if (histoman.nii.histogram.min < 0 & histoman.nii.histogram.max > 0)
                    {
                        var x = -histoman.nii.histogram.min/(histoman.nii.histogram.max-histoman.nii.histogram.min)
                        $line.attr("x1",histowidth*x)
                        $line.attr("x2",histowidth*x)
                        $line.attr("y1",0)
                        $line.attr("y2",histoheight)                        
                        $line.show()
                        
                    }
                    else
                        $line.hide()
                    var $poly = $histogramdiv.find("polygon");
                    var pstr = "";
                    if( histoman.nii.histogram.accus.maxfreq )
                    {
                        var scfac = 1 / histoman.nii.histogram.accus.maxfreq * 0.95;
                        for (var i = 0; i < histoman.nii.histogram.accus.length; i++)
                            pstr = pstr + (histowidth * i / histoman.nii.histogram.accus.length) + "," +
                                 (histoheight - histoheight * scfac * ((0 + histoman.nii.histogram.accus[i]))) + " ";
                        pstr = pstr + histowidth + "," + histoheight + " 0," + histoheight;
                    }
                    $poly.attr("points", pstr);
                    if (histoman.name)
                        $histoname.text(histoman.name).show();
                    else
                        $histoname.hide();
                    
                    return;
                }
            }
            // else
            histoman.hide();

        }
        histoman.updateHistogram = updateHistogram;


        function mapVal(val)
        {
            if (val != undefined)
                if (val.length == 3)
                {
                    return [255 * (val[0] - histoman.clim[0]) / (histoman.clim[1] - histoman.clim[0]),
                    255 * (val[1] - histoman.clim[0]) / (histoman.clim[1] - histoman.clim[0]),
                    255 * (val[2] - histoman.clim[0]) / (histoman.clim[1] - histoman.clim[0])];
                }
                else
                {
                    if (histoman.mode == 0)
                    {
                        if (histoman.gamma == 1)
                        {
                            return (val - histoman.clim[0]) / (histoman.clim[1] - histoman.clim[0]);
                        }
                        else                           
                            return (val > histoman.clim[0])?Math.pow((val - histoman.clim[0]) / (histoman.clim[1] - histoman.clim[0]),histoman.gamma):0;
                    }
                    else if (histoman.mode == 1)
                        return (val > histoman.clim[0]) ? 1 : 0;
                    else
                        return (val > histoman.clim[0]) ? 0 : 1;
                }
        }
        histoman.mapVal = mapVal;



        return histoman;

    }



    ////////////////////////////////// mouse handler//////////////////////////




    var mouseManager = new Object();
    that.mouseManager = mouseManager;
    mouseManager.scaleFac = .005;
    mouseManager.referenceRange = 1;
    mouseManager.lasteClickedPoint = new Array(0,0);
    mouseManager.lasteClickedColormap = new Array(0,1);
    mouseManager.didMove = false;
    mouseManager.dom = $container;




    function ROIpreviewUpdate() {
        if (master.roiTool.lastPreviewPoints != undefined)
        {
            var changedPoints = master.roiTool.lastPreviewPoints ;
            for (var k = 0; k < changedPoints.length;k++)
                    that.currentROI.content.data[changedPoints[k]] = 0;  
            master.roiTool.lastPreviewPoints = undefined;

        }
    }


    mouseManager.mouseleave_default = function(ev)
    {
        if (!ev.ctrlKey)
            KViewer.MouseInViewport = false;

        // roi Tool painter will take care to hide circle
        if (that.currentROI != undefined)
        {
            //master.roiTool.hidePen(that);
            if(master.roiTool.livepreview)
            {
                ROIpreviewUpdate();
                signalhandler.send("updateImage",{id:that.currentROI.fileID,no3d:true,lazy:false},that.imageupdater);
            }
        }
    }


    mouseManager.mousemove_default = moveUnlagger(function(ev)
    {
        if (!$(ev.target).hasClass('KViewPort_canvas') &&  KViewer.MouseInViewport)
        {
             mouseManager.mouseleave_default(ev);
             return;
        }
        
        KViewer.MouseInViewport = true;
        KViewer.lastHoveredViewport = that;

        if (that.currentROI != undefined && !that.isGLenabled() )
        {
            if (ev.buttons == 0 )
            {
                if (master.roiTool.drawPen(ev, that))
                {        
                    if (!master.roiTool.regionGrow && master.roiTool.livepreview)
                    {
                        ev.roipreview = true;
                        if (master.roiTool.lastPreviewPoints != undefined)
                            ROIpreviewUpdate();
                        master.roiTool.modifyRoi(ev, that,function(changedPoints){                    

                                if (!that.viewport.hasMouse)
                                {
                                    master.roiTool.lastPreviewPoints = changedPoints;                                    
                                    ROIpreviewUpdate();
                                    signalhandler.send("updateImage",{id:that.currentROI.fileID,no3d:true,lazy:false},that.imageupdater);                                    
                                }
                                else
                                {
                                    signalhandler.send("updateImage",{id:that.currentROI.fileID,no3d:true,lazy:false},that.imageupdater);
                                    ROIpreviewUpdate.tobecleaned = true;
                                    master.roiTool.lastPreviewPoints = changedPoints;                               
                                }
                            });
                    }
                }
                else
                 {
                     if (master.roiTool.livepreview)
                     {
                        if (ROIpreviewUpdate.tobecleaned)
                           signalhandler.send("updateImage",{id:that.currentROI.fileID,no3D:true},that.imageupdater);
                        ROIpreviewUpdate.tobecleaned = false;
                     }
                 } 

            }
        }
    });


    function IsMarkerOnClickCreate(ev)
    {
        return (!ev.shiftKey && !ev.ctrlKey && 
                            markerProxy && 
                            markerProxy.currentSet && 
                            markerProxy.currentSet.state.createonclick && 
                            markerProxy.currentSet.state.visible  &&
                            !markerProxy.currentSet.state.locked)
    }


    mouseManager.mousedown = function(ev)
    {
        if (KViewer.on_viewport_resizing)
            return;
        //      if (!$(this).hasClass("KViewPort_canvas3D") & !$(this).hasClass("KViewPort_canvas")  & !$(this).hasClass("KViewPort_scrollAccelerator") & !$(this).hasClass("KViewPort_icontainer") )
        if (!$(ev.target).hasClass("KViewPort_canvas3D") & !$(ev.target).hasClass("KViewPort_canvas")  & !$(ev.target).hasClass("KViewPort_icontainer") & ($(ev.target).attr('class') !== "roiTool_svg"))
            return;

        if (that.nii != undefined & !gl_enabled)
        {

            mouseManager.whichbutton = ev.button;
            mouseManager.whichbuttons = ev.buttons;

            var markerOnClickCreate =IsMarkerOnClickCreate(ev)


            if (!markerOnClickCreate & that.currentROI != undefined &  !ev.shiftKey & !ev.altKey)
            {
                ROIpreviewUpdate();
                master.roiTool.history.record('startRecording', that);
                master.roiTool.modifyRoi(ev, that,function()
                {
                    signalhandler.send("updateImage",{id:that.currentROI.fileID,roidraw:true},that.imageupdater);
                });
            }
            else if ((ev.button == 0 & !ev.ctrlKey & !ev.shiftKey) | (ev.button == 0 && that.currentROI != undefined && (ev.shiftKey||ev.ctrlKey)))
            {
                /********** new: check if the clicked point is outside of array */

                var rwc = getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY, true);

                if (that.currentROI != undefined)
                {
                    signalhandler.send("updateImage",{id:that.currentROI.fileID},that.imageupdater);
                    ROIpreviewUpdate();
                }             

// ERDO                   
                var voxelCoordinates = rwc.voxelCoordinates;
                if( voxelCoordinates[slicingDimOfArray] < 0 |  voxelCoordinates[slicingDimOfArray] >  that.nii.sizes[slicingDimOfArray]-0.50001)
                {
                    voxelCoordinates[slicingDimOfArray] = that.nii.centerVoxel._data[slicingDimOfArray];
                    var realWorldCoordinates = (math.multiply((that.nii.edges), voxelCoordinates));
                    if (master.mainViewport !== -1)
                    {
                        realWorldCoordinates = math.multiply(master.reorientationMatrix.matrix, realWorldCoordinates);
                    }
                    else
                    {
                        
                    }
                }
                else
                {
                    var realWorldCoordinates = rwc.realWorldCoordinates;

                }
                setWorldPosition( realWorldCoordinates );
                
                /*************/
                signalhandler.send("positionChange",{respectSliceChange: that.atlas.length==0},that.positionChanger);
                
                if (KViewer.atlasTool != undefined && KViewer.atlasTool.isinstance)
                     KViewer.atlasTool.updatePoint();
                signalhandler.send("labelChange")

                //setWorldPosition(getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY));
            } // right click 
            if (ev.button == 2 && that.currentROI == undefined)
            {

                function roi_ccanalysis_contextmenu(ev)
                {
                     mouseManager.cid_roipicker = undefined;
                     var res = KViewer.roiTool.contextPicker(ev,that);
                     if (res)
                     {
                        $(document).off("mousemove mouseup mouseleave");
                        $(mouseManager.dom).off('mousemove mouseup mouseleave');
                        $(mouseManager.dom).on('mousemove',mouseManager.mousemove_default);
                        $(mouseManager.dom).on('mouseleave', mouseManager.mouseleave_default);
                        return true;
                      }
                      else
                      {
                        return false;
                      }
                }
                // switch off delayed mode for now, some people wanted that
                // mouseManager.cid_roipicker = setTimeout(roi_ccanalysis_contextmenu,150)
                if( roi_ccanalysis_contextmenu(ev) )
                {
                    return false
                }
            }


            if (ev.button == 0 & ev.ctrlKey & ev.shiftKey & that.nii.sizes[3] > 1)
            {
                setWorldPosition(getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY));
                createTSeriesPinViewer(ev);
            }

            if (markerOnClickCreate)
            {
                if(KViewer.markerTool.enabled != 0  || ( markerProxy.currentSet.markerPanel &&  markerProxy.currentSet.markerPanel.panelvisible ) )
                { 
                    if (markerProxy.currentSet.type != "electrode" && !markerProxy.currentSet.state.locked)                
                        markerProxy.setDraggedPoint(  markerProxy.createMarker(ev, markerProxy.currentSet, that ), true );
                }
            }

            $(document).off("mousemove pointermove");
            $(document).on("pointermove", mouseManager.mousemove);
            $(document).on("pointerup mouseleave", mouseManager.mouseup);

            mouseManager.didMove = false;
            mouseManager.shift = ev.shiftKey;
            mouseManager.lasteClickedPoint[0] = ev.clientX;
            mouseManager.lasteClickedPoint[1] = ev.clientY;
            mouseManager.lasteMovedPoint = [ev.clientX, ev.clientY]

            mouseManager.lasteClickedColormap = histoManager.clim;
            mouseManager.climReferenceRange = histoManager.clim[1] - histoManager.clim[0];
            mouseManager.referenceSlice = currentSlice;
            mouseManager.referenceZoomFac = function() {
                return that.zoomFac
            }();
            mouseManager.referenceZoomOriginX = function() {
                return that.zoomOriginX
            }();
            mouseManager.referenceZoomOriginY = function() {
                return that.zoomOriginY
            }();

            if (KViewer.atlasTool != undefined && KViewer.atlasTool.isinstance)
                KViewer.atlasTool.updatePoint()

        }
  
  
    }


    mouseManager.mousemove = moveUnlagger(function(ev)
    {
        if (mouseManager.cid_roipicker != undefined)
        {
            clearTimeout(mouseManager.cid_roipicker)
            mouseManager.cid_roipicker = undefined;

        }
       
        var markerOnClickCreate =IsMarkerOnClickCreate(ev)

        mouseManager.didMove = true;
        ev.preventDefault();
        var stretchFacX = -(mouseManager.lasteClickedPoint[0] - ev.clientX);
        var stretchFacY = (mouseManager.lasteClickedPoint[1] - ev.clientY);
        var increment = [mouseManager.lasteMovedPoint[0] - ev.clientX, mouseManager.lasteMovedPoint[1] - ev.clientY];

        var roi_painting = (!markerOnClickCreate && master.roiTool.isinstance && master.roiTool.penEnabled & that.currentROI != undefined);
        if (1) //stretchFacX % 3 == 0 || stretchFacY % 3 == 0)
        {
            if (roi_painting  & !ev.shiftKey & !ev.altKey)
            {

                master.roiTool.drawPen(ev, that);
                master.roiTool.modifyRoi(ev, that,function(){
                    signalhandler.send("updateImage",{id:that.currentROI.fileID,frommove:true,roidraw:true},that.imageupdater);
                });

                return;
            }
            else if (!markerOnClickCreate && master.roiTool.isinstance & !ev.ctrlKey & !ev.shiftKey & ev.altKey)
            {
                ev.myScrollAmount = -increment[0];
                master.roiTool.pensizechange(ev, "radius", that);
            }

            if (mouseManager.whichbutton == 2) // right click 
            {
                if (mouseManager.whichbutton == 2 && master.roiTool.isinstance &&  master.roiTool.enabled && master.roiTool.penEnabled ) // in roi mode: only set current point
                {
                    signalhandler.send("positionChange",{},that.positionChanger);
                }
                else // no roi selected:
                {
                    if (ev.shiftKey)
                    {
                        if (KViewer.atlasTool.isinstance)
                        {
                            KViewer.atlasTool.point = getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY);
                            KViewer.atlasTool.update();
                            signalhandler.send("drawSlices labelChange");
                        }

                    }
                    else if (0) //ev.ctrlKey)
                    // right click + control: fast zoom
                    {
                        var r = math.round([(mouseManager.lasteClickedPoint[1] - $canvas.offset().top), (mouseManager.lasteClickedPoint[0] - $canvas.offset().left)]);


                        var a = math.exp(stretchFacY * 0.005);
                        var zf = mouseManager.referenceZoomFac * a;
                        var dy = -r[0] * (1 - a) + mouseManager.referenceZoomOriginY;
                        var dx = -r[1] * (1 - a) + mouseManager.referenceZoomOriginX;
                        //master.setZoomLims([zf, dy/$canvas.width() * wid_cm, dx / $canvas.height() * hei_cm]);

                        //signalhandler.send("setZoomLimsRelative", {zoomfac: zf, delta: [-1500,-1500], sender: slicingDimOfWorld} );
                        signalhandler.send("setZoomLims", [zf, 0, 0]);
                        signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger);
    
                        //signalhandler.send("setZoom", 1 + .08 * math.sign(increment[1]));
                        //signalhandler.send("positionChange", {nosliceupdate:true});


                        // signalhandler.send("setZoom", 1.1*math);
                        //signalhandler.send("setZoomLimsRelative", {zoomfac: zf, delta: [0, 0], sender: slicingDimOfWorld} )
                    }
                }
            }


             //       if (0) //(!ev.ctrlKey & !ev.shiftKey) // default: set colormap limits
            if (mouseManager.whichbutton == 1 )
            {
                // adjust left and right clim on l/r click
                //var clim = [mouseManager.lasteClickedColormap[0] + (stretchFacX * mouseManager.climReferenceRange * mouseManager.scaleFac * master.static.mousespeed_clims), mouseManager.lasteClickedColormap[1] + (stretchFacY * mouseManager.climReferenceRange * mouseManager.scaleFac** master.static.mousespeed_clims)];
                
                // adjust center and window
                //var refRange = mouseManager.climReferenceRange;

                // take the min / max of image as scaling reference
                var refRange = (that.nii.histogram.max - that.nii.histogram.min) * .25;
                var ww = (mouseManager.lasteClickedColormap[1] -  mouseManager.lasteClickedColormap[0] );
                var wc = (mouseManager.lasteClickedColormap[1] +  mouseManager.lasteClickedColormap[0] ) / 2;
                var wcnew = wc - (stretchFacY * refRange * mouseManager.scaleFac * master.static.mousespeed_clims);
                var wwnew = ww + (stretchFacX * refRange * mouseManager.scaleFac * master.static.mousespeed_clims);
                var lnew = wcnew - wwnew / 2;
                var rnew = wcnew + wwnew / 2;
                var clim = [lnew, rnew];
                signalhandler.send("climChange", {
                    id: that.currentFileID,
                    val: clim
                });

                if( 0 ) // press scroll wheel and slide --> fast slice change 
                {
                    var a = mouseManager.referenceSlice + stretchFacY * 0.3;
                    that.setSlicePos( slicingDimOfArray, a)
                }


            }

            if (mouseManager.whichbutton == 2 & !ev.ctrlKey & ev.shiftKey)
            {
                var dy = mouseManager.referenceZoomOriginY + stretchFacY;
                var dx = mouseManager.referenceZoomOriginX - stretchFacX;
                if (worldLockedToMaster & master.globalCoordinates & !that.isFlatMap)                    
                {
                    signalhandler.send("setZoomLimsRelative", {
                        zoomfac: that.zoomFac,
                        delta: [dx - that.zoomOriginX, dy - that.zoomOriginY],
                        sender: slicingDimOfWorld
                    })
                }
                else
                {
                    setZoomLims([that.zoomFac, dy, dx]);   
                }
            }

            if (mouseManager.whichbutton == 2 & !ev.ctrlKey & !ev.shiftKey)
            {
                if (that.mosaicview.active)
                {              
                    var sbox =  that.mosaicview.clipratio;
                    var cpos =  getCanvasCoordinates(getWorldPosition());
                    var dx = increment[0]/that.wid_px;
                    var dy = increment[1]/that.hei_px;
                    sbox[0] = sbox[0]+dx;
                    sbox[2] = sbox[2]+dx;
                    sbox[1] = sbox[1]+dy;
                    sbox[3] = sbox[3]+dy;
                    that.mosaicview.clipratio = sbox;                
                    setCanvasLayout();
                    drawHairCross();                    
                }
                else
                {
                    var dy = mouseManager.referenceZoomOriginY + stretchFacY;
                    var dx = mouseManager.referenceZoomOriginX - stretchFacX;
                    setZoomLims([that.zoomFac, dy, dx]);
                }
            }

            if (mouseManager.whichbutton == 0) // pan all images
            {

                if (!roi_painting & ev.ctrlKey & !ev.shiftKey)
                {
                    var dy = mouseManager.referenceZoomOriginY + stretchFacY;
                    var dx = mouseManager.referenceZoomOriginX - stretchFacX;
                    if (worldLockedToMaster & master.globalCoordinates)                    
                    {
                        signalhandler.send("setZoomLimsRelative", {
                            zoomfac: that.zoomFac,
                            delta: [dx - that.zoomOriginX, dy - that.zoomOriginY],
                            sender: slicingDimOfWorld
                        })
                    }
                    else
                    {
                        setZoomLims([that.zoomFac, dy, dx]);   
                    }

                }
                else if (!ev.ctrlKey & ev.shiftKey) // pan only this viewport
                {

                    {
                        var dy = mouseManager.referenceZoomOriginY + stretchFacY;
                        var dx = mouseManager.referenceZoomOriginX - stretchFacX;
                        setZoomLims([that.zoomFac, dy, dx]);
                    }
                }
                else 
                
                if (ev.ctrlKey & ev.shiftKey) // show the time series of this point
                {
                    if (that.nii.sizes[3] > 1)
                    {
                        setWorldPosition(getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY));
                        createTSeriesPinViewer(ev);
                    }
                }
                else // move haircross
                {
                    setWorldPosition(getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY));

                    

                    signalhandler.send("positionChange",{respectSliceChange:that.atlas.length==0},that.positionChanger);


                    if (KViewer.atlasTool != undefined && KViewer.atlasTool.isinstance)
                        KViewer.atlasTool.updatePoint();
                    signalhandler.send("labelChange")
    

                    if (markerProxy && markerProxy.draggedPoint !=undefined)
                    {
                        markerProxy.draggedPoint.obj.setsizeFromMouseEvent(0, mouseManager.lasteClickedPoint, [ev.clientX,ev.clientY], that, 'donotrecalc' );
                    }
                }

            }

        }

        
        mouseManager.lasteMovedPoint[0] = ev.clientX;
        mouseManager.lasteMovedPoint[1] = ev.clientY;
    });


    
    mouseManager.mouseup = function(ev, resetHandlersOnly)
    {

        
        if (mouseManager.cid_roipicker != undefined)
        {
            clearTimeout(mouseManager.cid_roipicker)
            mouseManager.cid_roipicker = undefined;
        }


        $(document).off("pointermove mousemove pointerup pointerleave mouseleave");
        $(mouseManager.dom).off('pointermove mousemove pointerup pointerleave  mouseleave');
        $(mouseManager.dom).on('mousemove',mouseManager.mousemove_default);
        $(mouseManager.dom).on('pointerleave', mouseManager.mouseleave_default);
        createTSeriesPinViewer('close');
        
        if(resetHandlersOnly)
            return false;

        if (that.currentROI != undefined && ev.ctrlKey && mouseManager.whichbutton == 2)
        {
              KViewer.roiTool.contextPicker(ev,that)
        }            
        else 
        if (that.currentROI != undefined & !ev.shiftKey & !ev.altKey)
        {
            ev.buttons = mouseManager.whichbuttons;
            
            master.roiTool.modifyRoi(ev, that,function()
            {
             //   KViewer.roiTool.update3D(that.currentROI)
                signalhandler.send("updateImage",{id:that.currentROI.fileID},that.imageupdater);
            });
        }
        else
       // if ((mouseManager.whichbutton == 0 | (mouseManager.whichbutton == 2 && master.roiTool.isinstance && master.roiTool.enabled && master.roiTool.penEnabled)) & !ev.shiftKey & !ev.ctrlKey)
        if (mouseManager.whichbutton == 0 & !ev.shiftKey & !ev.ctrlKey)
            if (mouseManager.didMove)
            {
                setWorldPosition(getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY));
                signalhandler.send("positionChange",{respectSliceChange:true},that.positionChanger);
            }

        if ((mouseManager.whichbutton == 0 | (mouseManager.whichbutton == 2 && master.roiTool.isinstance && master.roiTool.enabled && master.roiTool.penEnabled)) & !ev.shiftKey & !ev.ctrlKey)
        {

            if(markerProxy && markerProxy.draggedPoint !=undefined)
            {
                markerProxy.draggedPoint.obj.setsizeFromMouseEvent(0, mouseManager.lasteClickedPoint, [ev.clientX,ev.clientY], that, 'recalc' );
                markerProxy.setDraggedPoint();
            }

        }


    }


    $canvas.on('contextmenu', function() {
        return false;
    });
    $(mouseManager.dom).on('contextmenu', function() {
        return false;
    });
    $(mouseManager.dom).on('pointerdown', mouseManager.mousedown);
    $(mouseManager.dom).on('mousemove', mouseManager.mousemove_default);
    $(mouseManager.dom).on('pointerleave', mouseManager.mouseleave_default);

    function containerWidth()
    {
        return viewport.$container.width();
    }

    function containerHeight()
    {
        return viewport.$container.height();
    }

    function getRelativeZoomLims()
    {
        return [that.zoomFac, that.zoomOriginY / containerHeight(), that.zoomOriginX / containerWidth()]
    }
    that.getRelativeZoomLims = getRelativeZoomLims;

    function setZoom(fac)
    {
        if (that.nii == undefined | gl_enabled)
            return;

        var coords = getCanvasCoordinates(getWorldPosition());
        var cx = coords.x_pix+math.round(that.widoffs_px * that.zoomFac - that.zoomOriginX);
        var cy = coords.y_pix+math.round(that.heioffs_px * that.zoomFac - that.zoomOriginY);

        that.zoomFac = fac * that.zoomFac;

        that.zoomOriginY = (that.zoomOriginY + cy) * fac - cy;
        that.zoomOriginX = (that.zoomOriginX + cx) * fac - cx;
        setGlobalZoomsLims();


        setCanvasContainerPos();
        drawHairCross();

        renderOutlines("draw")
        for (var k = 0; k < that.atlas.length;k++)
            that.atlas[k].clearMultiOutlines()

    }
    signalhandler.attach("setZoom", function(fac){
        if (!that.isFlatMap)
            setZoom(fac)
    });

    function setZoomLimsRelative(zl)
    {

        if (that.nii == undefined | gl_enabled)
            return;

        var mapdelta = zl.delta;
        if (slicingDimOfWorld != zl.sender)
        {
            if (zl.sender == 0)
            {
                if (slicingDimOfWorld == 1)
                    mapdelta = [0, zl.delta[1]];
                else
                    mapdelta = [0, 0];
            }
            if (zl.sender == 1)
            {
                if (slicingDimOfWorld == 2)
                    mapdelta = [zl.delta[0], 0];
                else
                    mapdelta = [0, zl.delta[1]];
            }
            if (zl.sender == 2)
            {
                if (slicingDimOfWorld == 1)
                    mapdelta = [zl.delta[0], 0];
                else
                    mapdelta = [0, 0];
            }
        }


        that.zoomFac = zl.zoomfac;
        that.zoomOriginX = that.zoomOriginX + mapdelta[0];
        that.zoomOriginY = that.zoomOriginY + mapdelta[1];
        setGlobalZoomsLims();

        setCanvasContainerPos();
        drawHairCross();


        if (that.largeContent())
            drawSlice();            
    }
    signalhandler.attach("setZoomLimsRelative",
    function(e)
    {
        if (!that.isFlatMap)
            setZoomLimsRelative(e);

    });


    function setGlobalZoomsLims()
    {
        for (var k = 0; k < 3;k++)
            master.zoomLims[k] = [that.zoomFac, that.zoomOriginY, that.zoomOriginX];
//        master.zoomLims[slicingDimOfWorld] = [that.zoomFac, that.zoomOriginY, that.zoomOriginX];
    }

    function largeContent()
    {
        if (that.nii == undefined)
            return false;
        if (that.nii.datatype == 'rgb24')
            return false;
        var threshold = 150000;
        if (slicingDimOfArray == 2)
            return that.nii.sizes[0]*that.nii.sizes[1] > threshold; // & that.nii.sizes[2] > 1;
        else if (slicingDimOfArray == 1)
            return that.nii.sizes[0]*that.nii.sizes[2] > threshold; // & that.nii.sizes[1] > 1;
        else if (slicingDimOfArray == 0)
            return that.nii.sizes[2]*that.nii.sizes[1] > threshold; // & that.nii.sizes[0] > 1;
        
        return false;

    }
    that.largeContent = largeContent;

    function setZoomLims(zl,local)
    {
        if ((gl_enabled | that.nii == undefined) && zl != "reset")
            return;
        
        if (zl == "reset")
        {
            zl = [1,0,0]
            local = true
            that.mosaicview.reset();
            setCanvasLayout();
        }


        that.zoomFac = zl[0];
        if (zl[1] != undefined)
            that.zoomOriginY = zl[1];
        if (zl[2] != undefined)
            that.zoomOriginX = zl[2];
        if (!(local != undefined & local))
            setGlobalZoomsLims();

        setCanvasContainerPos();
        drawHairCross();
        if (that.largeContent())
            drawSlice();    
        else        
            renderOutlines("update");
    }
    signalhandler.attach("setZoomLims", setZoomLims);


    function MouseWheelHandler_(e)
    {
        if (gl_enabled)
            return;
        if (KViewer.zoomedViewport != -1 & !that.viewport.isZoomed())
            return;


        var e = window.event || e;
        // old IE support
        e.preventDefault();
        if (that.nii == undefined)
            return;
        var nii = that.nii;

        var amount = (e.wheelDelta || -e.detail);
        if (e.ctrlKey)
        {
            if (that.mosaicview.active)
            {

                var zo = ((amount > 0) ? -1 : 1) * 0.3 * scrollSpeed * master.static.mousespeed_zoom;
                var sbox =  that.mosaicview.clipratio;
                var cpos =  getCanvasCoordinates(getWorldPosition());
                var zoomy = 1+0.1*zo;
                sbox[0] = (sbox[0]-cpos.x_norm)*zoomy + cpos.x_norm;
                sbox[2] = (sbox[2]-cpos.x_norm)*zoomy + cpos.x_norm;
                sbox[1] = (sbox[1]-cpos.y_norm)*zoomy + cpos.y_norm;
                sbox[3] = (sbox[3]-cpos.y_norm)*zoomy + cpos.y_norm;
                if (sbox[0]<0) sbox[0] = 0;
                if (sbox[1]<0) sbox[1] = 0;
                if (sbox[2]>1) sbox[2] = 1;
                if (sbox[3]>1) sbox[3] = 1;
                if (sbox[2]-sbox[0] < 0.0001 | sbox[3]-sbox[1]  < 0.0001 )
                 {
                    sbox = [0,0,1,1];
                    alertify.error("are you nuts")
                }                
                that.mosaicview.clipratio = sbox;                
                setCanvasLayout();
                drawHairCross();

            }
            else if(markerProxy.currentSet && markerProxy.currentSet.type == 'scribble' && markerProxy.currentSet.state.createonclick)
            {
                markerProxy.currentSet.markerPanel.scribbleTool.updateSpenRadius(e)
            }
            else
            {
                var fac = 1;
                if (amount > 0)
                    fac += 0.02 * scrollSpeed * master.static.mousespeed_zoom;
                else
                    fac -= 0.02 * scrollSpeed * master.static.mousespeed_zoom;
                if (that.zoomFac * fac < 0.3)
                    return;
                $(".markerpoint,.markerruler").css('display','none')                    
                if (worldLockedToMaster & master.globalCoordinates & !that.isFlatMap)                    
                {
                    signalhandler.send("setZoom", fac);
                    if (fac > 1)
                        signalhandler.send("positionChange", {nosliceupdate:true},that.positionChanger); 
                    else
                    {
                        if (that.wheelzoom_cid)
                            clearTimeout(that.wheelzoom_cid)
                        that.wheelzoom_cid = 
                            setTimeout(function() {
                                signalhandler.send("positionChange", {nosliceupdate:false},that.positionChanger); // why this ...markers?
                                that.wheelzoom_cid = undefined;
                            },100);

                    }
         //           signalhandler.send("positionChange",{respectSliceChange:true},that.positionChanger);

            

                }
                else
                    setZoom(fac);
       //         signalhandler.send("positionChange", {nosliceupdate:true});

            }
        }
        else if (e.shiftKey)
        {
            if (that.currentROI != undefined) // shift +scroll in roi mode == change pencil size
            {
                e.myScrollAmount = master.static.mousespeed_roipensize * scrollSpeed * math.sign(e.wheelDelta || -e.detail);
                master.roiTool.pensizechange(e, "radius", that);

                if (!master.roiTool.regionGrow && master.roiTool.livepreview)
                {
                    e.roipreview = true;
                    if (master.roiTool.lastPreviewPoints != undefined)
                        ROIpreviewUpdate();
                    master.roiTool.modifyRoi(e, that,function(changedPoints){                    
                            signalhandler.send("updateImage",{id:that.currentROI.fileID,no3d:true,lazy:false},that.imageupdater);
                            ROIpreviewUpdate.tobecleaned = true;
                            master.roiTool.lastPreviewPoints = changedPoints;
                            ROIpreviewUpdate();

                    });
                }
            }
            else
            {
                if (that.mosaicview.active)
                {
                    that.mosaicview.nx_cont += ((amount > 0) ? -1 : 1) * 0.3 * scrollSpeed;
                    if (that.mosaicview.nx_cont < 2)
                        that.mosaicview.nx_cont = 2;
                    that.mosaicview.nx = Math.round(that.mosaicview.nx_cont);
                    setCanvasLayout();
                    drawHairCross();

                }
                else
                {
                    if( that.nii.numTimePoints > 1 )
                        setCurrentTimePoint( parseInt(that.nii.currentTimePoint.t) + (amount > 0?1:-1)*scrollSpeed)
                }
            }

        }
        else
        {

            if (0) //(that.mosaicview.active)
            {

            }
            else
                that.handleSliceChange(slicingDimOfArray, amount)
        }


    }


    that.handleSliceChange = function(slicingDimOfArray, amount,inc)
    {
        var nii = that.nii;
        var temp = currentVoxel._data[slicingDimOfArray];
        
	amount *= nii.arrayReadDirection[slicingDimOfArray];

        if (amount > 0) {
            if (inc != undefined)
                temp += inc;
            else
                temp += Math.round(scrollSpeed * master.globalScrollSpeed);
        } else {
            if (inc != undefined)
                temp -= inc;
            else
                temp -= Math.round(scrollSpeed * master.globalScrollSpeed);
        }
        currentVoxel._data[slicingDimOfArray] = temp;

        var wasinrange = true;
        if (currentVoxel._data[slicingDimOfArray] >= that.nii.sizes[slicingDimOfArray] - 0.0001 )
        {
            currentVoxel._data[slicingDimOfArray] = that.nii.sizes[slicingDimOfArray] - 1;
            wasinrange = false;    
        }
        if (currentVoxel._data[slicingDimOfArray] < 0)
        {
            currentVoxel._data[slicingDimOfArray] = 0;
            wasinrange = false;    
        }
        var realWorldCoordinates = (math.multiply((nii.edges), currentVoxel));
        if (master.mainViewport !== -1)
        {
            realWorldCoordinates = math.multiply(master.reorientationMatrix.matrix, realWorldCoordinates);
        }

        if(!wasinrange)
        {
            if(that.$container.find('.KViewPort_sliceOutsideRange').length == 0 )
                var $stop = $("<div class='KViewPort_sliceOutsideRange'>STOP</div>").appendTo(that.$container).fadeOut(850, function(){$stop.remove();}); ;
        }

        setWorldPosition(realWorldCoordinates);
        signalhandler.send("positionChange",{respectSliceChange:true},that.positionChanger);

    }

    that.setSlicePos = function(slicingDimOfArray, pos)
    {
 
        var nii = that.nii;
        var wasinrange = true;

        if (pos > that.nii.sizes[slicingDimOfArray] - 1 - .000000001)
        {
            currentVoxel._data[slicingDimOfArray] = that.nii.sizes[slicingDimOfArray] - 1;
            wasinrange = false;    
        }
        else if (pos < .0000001)
        {
            currentVoxel._data[slicingDimOfArray] = 0;
            wasinrange = false;    
        }
        else
        {
            currentVoxel._data[slicingDimOfArray] = pos;
            wasinrange = true;    

        }

        var realWorldCoordinates = (math.multiply((nii.edges), currentVoxel));
        if (master.mainViewport !== -1)
        {
            realWorldCoordinates = math.multiply(master.reorientationMatrix.matrix, realWorldCoordinates);
        }
        setWorldPosition(realWorldCoordinates);
        signalhandler.send("positionChange",{respectSliceChange:true},that.positionChanger);
        
        if(!wasinrange)
        {
            if(that.$container.find('.KViewPort_sliceOutsideRange').length == 0 )
                var $stop = $("<div class='KViewPort_sliceOutsideRange'>STOP</div>").appendTo(that.$container).fadeOut(850, function(){$stop.remove();}); ;
        }
        return {wasinrange: wasinrange, value:  currentVoxel._data[slicingDimOfArray] };
    }


/*

    that.setSubsampling = function(f)
    {
        that.subsample_factor = f;
        //setCanvasContainerPos();
        applySlicingDimOfWorld(slicingDimOfWorld);
        setCanvasLayout()
        that.drawSlice();
    }

*/

    ////////////////////////////// canvas//imaging layout //////////////////////////


    function setSlicingDimOfWorld(sd)
    {
        if (sd === 'toggle')
        {
            slicingDimOfWorld = ((slicingDimOfWorld + 1) % 3);
        }
        else if (sd != undefined)
        {
            slicingDimOfWorld = sd;
        }
 
        for (var k = 0; k < 3; k++)
            if (slicingDimOfWorld == k)
            {
                toolbar.$sliceCubes[k].show();    
                layoutbar.$sliceCubes[k].show();    
            }
            else
            {
                toolbar.$sliceCubes[k].hide();    
                layoutbar.$sliceCubes[k].hide();    
            }
            

        applySlicingDimOfWorld(slicingDimOfWorld);
        setCanvasLayout();

    
        drawSlice({eagerDrawActive:true});

    }

    function applySlicingDimOfWorld(slicingDimOfWorld)
    {
        var nii = that.nii;
        if (nii == undefined)
            return;

        slicingDimOfArray = nii.permutationOrder.indexOf(slicingDimOfWorld);


        if (slicingDimOfArray == 0) {
            swapXY = (nii.permutationOrder[1] > nii.permutationOrder[2]) ? 1 : 0;
            sx = nii.sizes[1];
            sy = nii.sizes[2];
            xdir = -nii.arrayReadDirection[1];
            ydir = -nii.arrayReadDirection[2];
            sliceAspectRatio = sx / sy * nii.voxSize[1] / nii.voxSize[2];
            var voxSizeX = nii.voxSize[1];
            var voxSizeY = nii.voxSize[2];

        }

        if (slicingDimOfArray == 1) {
            swapXY = (nii.permutationOrder[0] > nii.permutationOrder[2]) ? 1 : 0;
            sx = nii.sizes[0];
            sy = nii.sizes[2];
            xdir = -nii.arrayReadDirection[0];
            ydir = -nii.arrayReadDirection[2];
            sliceAspectRatio = sx / sy * nii.voxSize[0] / nii.voxSize[2];
            var voxSizeX = nii.voxSize[0];
            var voxSizeY = nii.voxSize[2];
        }

        if (slicingDimOfArray == 2) {
            swapXY = (nii.permutationOrder[0] > nii.permutationOrder[1]) ? 1 : 0;
            sx = nii.sizes[0];
            sy = nii.sizes[1];
            xdir = -nii.arrayReadDirection[0];
            ydir = -nii.arrayReadDirection[1];
            sliceAspectRatio = sx / sy * nii.voxSize[0] / nii.voxSize[1];
            var voxSizeX = nii.voxSize[0];
            var voxSizeY = nii.voxSize[1];
        }
        that.swapXY = swapXY;

        xflip = xdir == 1 ? 0 : 1;
        yflip = ydir == 1 ? 0 : 1;

        sx = Math.ceil(sx / that.subsample_factor_x);
        sy = Math.ceil(sy / that.subsample_factor_y);



        var asx, asy;
        asx = swapXY ? sy : sx;
        asy = swapXY ? sx : sy;

        csx = asx;
        csy = asy;
        that.embedfac_width = asx / csx;
        that.embedfac_height = asy / csy;


        voxSize_x = swapXY ? voxSizeY : voxSizeX;
        voxSize_y = swapXY ? voxSizeX : voxSizeY;
        wid_cm = voxSize_x * csx;
        hei_cm = voxSize_y * csy;

    }

    function applySlicingDimOfArray(d)
    {
        //slicingDimOfArray = slicingDimOfArray_;
        slicingDimOfWorld = that.nii.permutationOrder[d];
        applySlicingDimOfWorld(slicingDimOfWorld)
    }




    function save_old_hc_pos()
    {

        var old_hc_pos_x
        var old_hc_pos_y
        if (that.nii != undefined)
        {


            // CONGRU
            var wp = getWorldPosition()

//            if (KViewer.navigationTool.isinstance && 
  //              (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0)))
            if (isBackgroundMoving())
                {
                    if (KViewer.mainViewport == -1)
                        wp = math.multiply((master.reorientationMatrix.matrix), wp);
                    //else
                    //    wp = math.multiply(math.inv(master.reorientationMatrix.matrix), wp);

                }
                    
              
            var x = getCanvasCoordinates(wp);
            var cpos = that.$canvas.offset();
            cpos.top -= that.$container.offset().top;
            cpos.left -= that.$container.offset().left;
            old_hc_pos_x = x.x_pix + cpos.left
            old_hc_pos_y = x.y_pix + cpos.top

            if (old_hc_pos_x <0 | old_hc_pos_x > that.$container.width()
               | old_hc_pos_y <0 | old_hc_pos_y > that.$container.height())
            {
                old_hc_pos_x = that.$container.width()/2;
                old_hc_pos_y = that.$container.height()/2;
            }
        }
        that.old_hc_pos_x = old_hc_pos_x;
        that.old_hc_pos_y = old_hc_pos_y;

    }
    signalhandler.attach("save_old_hc_pos",save_old_hc_pos)
    
    ///////////////////// mosaic ////////////////////////////////////////////////////

    that.mosaicview = KMosaicView(that);
    that.mosaicview.$sliderdiv.appendTo($topRow).hide();


    ///////////////////// setCanvasLayaout //////////////////////////////////////////


    var container_width_old;
    var container_height_old;
    function setCanvasLayout()
    {
        var $ref = viewport.isZoomed() ? master.$zoomedPortContainer : viewport.$container;
     
        $container.width($ref.width());
        $container.height($ref.height());
        if (ViewerSettings.pixelated)
            $canvas.addClass('KViewPort_canvas_pixelated');
        else
            $canvas.removeClass('KViewPort_canvas_pixelated');
        if (ViewerSettings.canvasborder)
            $canvas.addClass('KViewPort_canvas_border');
        else
            $canvas.removeClass('KViewPort_canvas_border');

        if (that.nii != undefined)
        {
            var nii = that.nii;
            var ext = [nii.sizes[0] * nii.voxSize[0], nii.sizes[1] * nii.voxSize[1], nii.sizes[2] * nii.voxSize[2]];
            var FOV_mm =  Math.max.apply(null , ext);

            if (that.isFlatMap)
                that.FOV_mm = FOV_mm
            else
            {
                if (master.defaultFOV_mm == "")                
                    master.defaultFOV_mm = FOV_mm;
                that.FOV_mm = master.defaultFOV_mm;
            }


        }



        if (gl == undefined & gl_enabled)
        {
            gl = new KMedImg3D(that,$canvas3D);
            that.gl = gl;

            if (that.nii && that.nii.dummy)
            {
                gl.setPlanesVisibility([0,0,0]);
            }
        }


        if (gl_enabled & (that.nii != undefined | that.objects3D.length > 0))
        {
            //$canvascontainer.css({height: "100%", width: "100%", top:0, left:0});
            that.mosaicview.hideControls();
            $canvascontainer.hide();

            $canvas3D.show();


            $canvas3D.css({
                height: "100%",
                width: "100%",
                top: 0,
                left: 0
            });

            gl.updateLayout();
            gl.engine.resize();
            $scrollAccelerator.hide();
            signalhandler.send("canvasLayoutChanged", that.viewport);
  
        }

        if (that.nii != undefined & !gl_enabled)
        {
            $canvascontainer.show();

            $LeftRightSign.css({
                top: $container.offset().top + math.floor($container.height() / 2) - 90 + 'px'
            });
            var nii = that.nii;
            //  want to see at least the defaultFOVwidth_mm, no matter if width or height
            var fac;


            if ($container[0].offsetWidth < $container[0].offsetHeight)
                fac = $container[0].offsetWidth / that.FOV_mm;
            else
                fac = $container[0].offsetHeight / that.FOV_mm;

            that.wid_px = wid_cm * fac;
            that.hei_px = hei_cm * fac;


            // we need this to have intuitive scaling during viewerresize
            if (container_width_old != undefined && container_width_old > 0 && container_height_old > 0)
            {
                var facX = $container[0].offsetWidth / container_width_old;
                var facY = $container[0].offsetHeight / container_height_old;
                that.zoomOriginX *= facX;
                that.zoomOriginY *= facY
                if (0) //master.zoomLims[slicingDimOfWorld] != undefined && (that.zoomOriginX != 0 || that.zoomOriginX != 0))
                {
                    if (facX != 1 | facY != 1)
                    {
                        master.zoomLims[slicingDimOfWorld][1] = that.zoomOriginY;
                        master.zoomLims[slicingDimOfWorld][2] = that.zoomOriginX;
                    }
                    else
                    {
                        that.zoomOriginY = master.zoomLims[slicingDimOfWorld][1]
                        that.zoomOriginX = master.zoomLims[slicingDimOfWorld][2]
                    }
                }


            }


            container_width_old = $container[0].offsetWidth;
            container_height_old = $container[0].offsetHeight;


            that.embedrelfac = fac;

            //var center = master.viewcenter;
            var center = nii.centerWorld
            var orig = math.multiply(math.inv(nii.edges), center);
            var origin = math.matrix([((nii.arrayReadDirection[0] == 1) ? (nii.sizes[0] - orig._data[0] - 0.5) : (0.5 + orig._data[0])) * nii.voxSize[0],
            ((nii.arrayReadDirection[1] == 1) ? (nii.sizes[1] - orig._data[1] - 0.5) : (0.5 + orig._data[1])) * nii.voxSize[1],
            ((nii.arrayReadDirection[2] == 1) ? (nii.sizes[2] - orig._data[2] - 0.5) : (0.5 + orig._data[2])) * nii.voxSize[2]]);

            var idx = [[0, 1, 2]];
            idx[nii.permutationOrder[0]] = 0;
            idx[nii.permutationOrder[1]] = 1;
            idx[nii.permutationOrder[2]] = 2;



            if (slicingDimOfWorld == 0)
            {
                that.widoffs_px = -origin._data[idx[1]] * fac + $container.width() / 2;
                that.heioffs_px = -origin._data[idx[2]] * fac + $container.height() / 2;
            }
            if (slicingDimOfWorld == 1)
            {
                that.widoffs_px = -origin._data[idx[0]] * fac + $container.width() / 2;
                that.heioffs_px = -origin._data[idx[2]] * fac + $container.height() / 2;
            }
            if (slicingDimOfWorld == 2)
            {
                that.widoffs_px = -origin._data[idx[0]] * fac + $container.width() / 2;
                that.heioffs_px = -origin._data[idx[1]] * fac + $container.height() / 2;
            }
            if (that.mosaicview.active)
            {
                that.mosaicview.showControls();
                var sx_, sy_, sz_;

                var perm = [];
                if (slicingDimOfArray == 0)
                    perm = [1, 2, 0];
                if (slicingDimOfArray == 1)
                    perm = [0, 2, 1];
                if (slicingDimOfArray == 2)
                    perm = [0, 1, 2];
                var sz_ = that.nii.sizes[perm[2]];
                that.mosaicview.current_sz_ = sz_;
                that.mosaicview.current_readDir = -that.nii.arrayReadDirection[perm[2]];

                var vasp = that.nii.voxSize[perm[0]] / that.nii.voxSize[perm[1]];
                
                var csx_ = math.floor((that.mosaicview.clipratio[2]-that.mosaicview.clipratio[0]) * csx);
                var csy_ = math.floor((that.mosaicview.clipratio[3]-that.mosaicview.clipratio[1]) * csy);
                that.mosaicview.csx_ = csx_;
                that.mosaicview.csy_ = csy_;


                var height = Math.round(vasp * csx_ * that.mosaicview.nx / $container.width() * $container.height());
                that.mosaicview.ny = Math.floor(height / csy_);
                if (that.mosaicview.numrows != undefined)
                    that.mosaicview.ny = that.mosaicview.numrows;
                that.mosaicview.ny_div = height / csy_;

                that.mosaicview.z0 = Math.round(that.mosaicview.start * sz_);
                that.mosaicview.dz =((that.mosaicview.end - that.mosaicview.start) * sz_ / (that.mosaicview.nx * that.mosaicview.ny -1));

                that.mosaicview.dz = (that.mosaicview.dz < 1) ? 1 : that.mosaicview.dz;


                var width = csx_ * that.mosaicview.nx;



                ctx.canvas.width = width;
                ctx.canvas.height = height;

                var nrow = math.floor(that.mosaicview.ny + 0.5);

                var nrow_ = (sz_ - that.mosaicview.z0) / that.mosaicview.dz / that.mosaicview.nx;
                if (nrow > nrow_)
                    nrow = nrow_;


                var top = $container.height() / ctx.canvas.height *
                (ctx.canvas.height - nrow * csy_) * 0.4;
                if (top < 0)
                    top = 0;


                $canvascontainer.css({
                    height: math.round($container.height()) + 'px',
                    width: math.round($container.width()) + 'px',
                    top: top + 'px',
                    left: math.round(0) + 'px'
                });



                that.mosaicview.draw = function(slicedrawer)
                {
                    if (that.mosaicview.interval != -1)
                        clearInterval(that.mosaicview.interval);


                    var $colselector= KColorSelector(['hide',[0,0,0],[255,255,255]].concat(KColor.list), function (c) {
                        return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
                        },
                        function(c,k) { 
                             that.mosaicview.number_color = c;
                             if (c=='hide')
                                 that.$topRow.find(".mosaiclabels").css('display','none')
                             else
                             {
                                 that.$topRow.find(".mosaiclabels").css('color', RGB2HTML(c[0], c[1], c[2]))
                                 that.$topRow.find(".mosaiclabels").css('opacity', 1)
                             }
                        }, {}) ;


                    that.$topRow.find(".mosaiclabels").remove();
                    var z = that.mosaicview.z0;
                    for (var y = 0; y < that.mosaicview.ny; y++)
                    {
                        for (var x = 0; x < that.mosaicview.nx; x++)
                        {
                            if (z>sz_-1)
                                break;
                            var p = [0,0,0,1];
                            if (that.mosaicview.current_readDir == -1)
                                p[perm[2]] = sz_ - z;
                            else
                                p[perm[2]] = z;
                            p = math.multiply(that.nii.edges,p)._data;

                            
                            var $d = $("<div class='mosaiclabels'> "+ Math.round(p[slicingDimOfWorld]) +" </div>");
                            $d.css('left',10+x/that.mosaicview.nx*$container.width());
                            $d.css('top',10+top+ y*csy_* $container.height() / ctx.canvas.height);
                            $d.on('contextmenu', $colselector.themenu);
                            that.$topRow.append($d);
                            if (that.mosaicview.number_color == 'hide')
                            {
                                if (x!=0)
                                  $d.css('display','none')                                
                                else
                                  $d.css('opacity',0.2)                                
                                    
                            }
                            else
                            {
                                var c = that.mosaicview.number_color
                                if (c != undefined)
                                    $d.css('color',RGB2HTML(c[0], c[1], c[2]))
                            }
                            

                            z+=that.mosaicview.dz;
                        }
                    }




                    var z = that.mosaicview.z0;
                    var done = false;
                    var y = 0;
                    var x = 0;


                    if (master.static.lazydraw_timeout == 0 || typeof eagerDrawActive != "undefined")
                    {
                           while(true)
                           {
                               iterateOverMosaic();
                               if (y >= that.mosaicview.ny - 0.5 | z > sz_)
                                break;
                           }
                           
                    }
                    else
                        that.mosaicview.interval = setInterval(function()
                        {
                            if (that.nii == undefined)
                            {
                                clearInterval(that.mosaicview.interval);
                                that.mosaicview.interval = -1;
                                return;
                            }
                            iterateOverMosaic()
                            if (y >= that.mosaicview.ny - 0.5 | z > sz_)
                            {
                                clearInterval(that.mosaicview.interval);
                                that.mosaicview.interval = -1;
                            }


                        }, 0);




                    function iterateOverMosaic()
                    {
                        if (csx_ <= 0 | csy_ <=0)
                        {
                            clearInterval(that.mosaicview.interval);
                            that.mosaicview.interval = -1;
                            return                       
                        }
                        sliceData = ctx.createImageData(csx_, csy_);
                        var dir = that.nii.arrayReadDirection[that.getSlicingDimOfArray()] == -1;
                        if (that.mosaicview.mosaic_direction)
                            dir = !dir;
                        if (dir)
                            slicedrawer(Math.round(z), that.mosaicview.clipratio);
                        else
                            slicedrawer(Math.round(sz_-z-1), that.mosaicview.clipratio);
                        z += that.mosaicview.dz;
                        ctx.putImageData(sliceData, x * csx_, y * csy_);

                        if (++x >= that.mosaicview.nx)
                        {
                            x = 0;
                            y++;
                        }
                    }

/*
                    that.mosaicview.interval = setInterval(function()
                    {
                        if (that.nii == undefined)
                        {
                            clearInterval(that.mosaicview.interval);
                            that.mosaicview.interval = -1;
                            return;
                        }

                        sliceData = ctx.createImageData(csx_, csy_);
                        if (that.nii.arrayReadDirection[that.getSlicingDimOfArray()] == -1)
                            slicedrawer(z, that.mosaicview.clipratio);
                        else
                            slicedrawer(sz_-z, that.mosaicview.clipratio);
                        z += that.mosaicview.dz;
                        ctx.putImageData(sliceData, x * csx_, y * csy_);

                        if (++x >= that.mosaicview.nx)
                        {
                            x = 0;
                            y++;
                        }


                        if (y >= that.mosaicview.ny - 0.5 | z > sz_)
                        {
                            clearInterval(that.mosaicview.interval);
                            that.mosaicview.interval = -1;
                        }


                    }, 0);
*/

                }
                if (master.mainViewport != -1)
                    that.mosaicview.draw(drawSlice_interpolate);
                else
                    that.mosaicview.draw(drawSlice_normal);

            }
            else
            {


                that.mosaicview.hideControls()

                if (ctx.canvas.height != csy)
                    ctx.canvas.height = csy;
                if (ctx.canvas.width != csx)
                    ctx.canvas.width = csx;



                drawHairCross();
                setCanvasContainerPos()


            }

            // set the distances of the mover / rotator lines
            var siz = that.$container.width();
            var hei = that.$container.height();
            if(siz > hei)
                siz = hei;

            haircross.X.lineN.setsizes(siz);
            haircross.Y.lineN.setsizes(siz);
    
            $canvas.show();
            signalhandler.send("canvasLayoutChanged", that.viewport);
            if (that.old_hc_pos_x != undefined)
            {
                // CONGRU
                var wp = getWorldPosition()
  //              if (KViewer.navigationTool.isinstance && 
//                    (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0)))
                if (isBackgroundMoving())                    
                    {
                        if (KViewer.mainViewport == -1)
                            wp = math.multiply((master.reorientationMatrix.matrix), wp);

                    }

                var coords = getCanvasCoordinates(wp);
                var dy = coords.y_pix+that.heioffs_px*that.zoomFac-that.old_hc_pos_y
                var dx = coords.x_pix+that.widoffs_px*that.zoomFac-that.old_hc_pos_x;
                setZoomLims([that.zoomFac, dy, dx]);
                that.old_hc_pos_x = undefined
                that.old_hc_pos_y = undefined
            }	
            

        }
        histoManager.layoutHistogram();
    }

    function setCanvasContainerPos()
    {
        if (that.mosaicview.active)
        {
        /*   $canvascontainer.css({height: math.round($container.height())  + 'px', 
                                  width:  math.round($container.width())   + 'px', 
                                  top:    math.round(0) + 'px',
                                  left:   math.round(0) + 'px'});*/
        }
        else
        {

//qwe
            var subx =  that.subsample_factor_x
            var suby =  that.subsample_factor_y
            if (swapXY)
            {
               subx =  that.subsample_factor_y 
               suby =  that.subsample_factor_x                
            }
            
            quiver.draw();
            $canvascontainer.css({
                height: math.round(that.hei_px * that.zoomFac * suby) + 'px',
                width: math.round(that.wid_px * that.zoomFac* subx) + 'px',
                top: math.round(that.heioffs_px * that.zoomFac - that.zoomOriginY) + 'px',
                left: math.round(that.widoffs_px * that.zoomFac - that.zoomOriginX) + 'px'
            });
        }

    }


    function createOverlay(imageStruct,intent)
    {

        var ovl = {
            type: 'overlay',
            nii: imageStruct.content,
            content: imageStruct,
            visible: true,
            showcolored: false,
            
            showcolored_type :"raw",
            currentFilename: imageStruct.filename,
            currentFileinfo: imageStruct.fileinfo,
            fileinfo: imageStruct.fileinfo,
            currentFileID: imageStruct.fileID,
        };

        ovl.histoManager = createHistoManager(ovl);

        ovl.toggle = function(e)
        {
            var vis = !ovl.visible;
            ovl.setVisibility(vis)
            
            if (!e.shiftKey)
            {
                master.iterateMedViewers(function(m)
                {
                    for (var k = 0; k < m.overlays.length; k++)
                        if (ovl.currentFileID == m.overlays[k].currentFileID)
                        {
                            m.overlays[k].setVisibility(vis)
                            break;
                        }

                });            
            }
        }

        ovl.setVisibility = function(visible)
        {
            if (!visible)
            {
                ovl.visible = false;
                ovl.eye.css('color', 'red');
                if (ovl.refSurfView != undefined)
                {
                   ovl.refSurfView.visible = false;
                   ovl.refSurfView.update();
                }
                if (ovl.surfacecolref)
                    ovl.surfacecolref.update();

            }
            else
            {
                ovl.visible = true;
                ovl.eye.css('color', '');
                if (ovl.refSurfView != undefined)
                {
                   ovl.refSurfView.visible = true;
                   ovl.refSurfView.update();
                }
                if (ovl.surfacecolref)
                    ovl.surfacecolref.update();
            }
            that.drawSlice({
                mosaicdraw: true
            });
        }



        ovl.setOutlines = function(visible,ev)
        {

                if (visible)
                {
                    if (ovl.outlines == undefined)
                        ovl.outlines = Outlines(ovl);

                    if (ovl.color == undefined && ev != undefined)
                       ovl.chooseContColor(ev);
                    else
                        ovl.outlines.update(that);

                }
                else
                {
                    if (ovl.outlines != undefined)
                    {
                        ovl.outlines.close();
                        ovl.outlines = undefined;
                    }
                }

        }
 
       ovl.chooseContColor = function(ev)
        {

              if (ovl.color == undefined)
                ovl.color = 0;

            var colors = KColor.list;

            function colencode(c) {
                if (c != undefined)
                    return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
                }
              var $colselector = KColorSelector(colors, colencode,
                function() { 
                    ovl.outlines.update(that);                  
                    if (!ev.shiftKey)
                         master.iterateMedViewers(function(m)
                         {
                            for (var k = 0; k < m.overlays.length; k++)
                                if (ovl.currentFileID == m.overlays[k].currentFileID)
                                {
                                    if (m.overlays[k].outlines != undefined)
                                    {
                                        m.overlays[k].color = ovl.color;
                                        m.overlays[k].outlines.update(m);    
                                    }
                                    break;
                                }

                         });            

                }, ovl);

            $colselector.themenu(ev);


            ovl.outlines.update(that);                  

        }


        function close()
        {

            for (var k = 0; k < ovl.divs.length; k++)
                ovl.divs[k].remove();

            ovl.histoManager.remove();

            if (movieIsPlayed)
                toggleMovie();
            //$timediv.hide();
            $timediv.update();

           if (ovl.refSurfView != undefined)
            {
                signalhandler.detach("overlay_climChange",ovl.refSurfView.surf.clim_updater);
                ovl.refSurfView.close();
                ovl.refSurfView = undefined;
 
            }

            that.FOV_mm = undefined;

            signalhandler.detach("overlay_climChange",ovl.histoManager.climchange_id);
            signalhandler.detach("overlay_climChange",ovl.histoManager.cmapchange_id);

            if (ovl.outlines != undefined)
              {
                    ovl.outlines.close();
                    ovl.outlines = undefined;
              }


            signalhandler.send("layoutHisto");

            if (ovl.customClose)
            {
                ovl.customClose();
                return;
            }


            quiver.clear();

            for (var k = 0; k < that.overlays.length; k++)
            {
                if (ovl == that.overlays[k])
                {
                    that.overlays.splice(k, 1);
                    break;
                }
            }

            that.removeQuiver(ovl.histoManager);

            if (that.nii)
                that.drawSlice({
                    mosaicdraw: true
                });

            that.toolbar.update('overlay')
         
        }
        var filenameToShow;
        if (ovl.currentFileinfo.SubFolder==undefined || ovl.currentFileinfo.SubFolder)
            filenameToShow = "<b>" + ovl.currentFilename + "</b>";
        else
            filenameToShow = ovl.currentFileinfo.SubFolder+ "/<b>" + ovl.currentFilename + "</b>";

        var mlen = 40;
        if (filenameToShow.length > mlen)
        {
            filenameToShow = "..." + filenameToShow.substring(filenameToShow.length-mlen);
        }

        var $dragdiv, $quiverdiv, $captiondiv,$createIso,$createFib;
        ovl.divs = [
            $("<br style='clear:both' />"),
            $("<div  class='KViewPort_tool overlay persistent'>  <i class='fa fa-close fa-1x'></i></div>").appendTooltip("closeOVL")
            .click(close).mousedown(viewport.closeContextMenu(ovl)),
            $quiverdiv = $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-code-fork fa-1x'> </div>").click(function(e) {
                quiver.menu(e,ovl)
            }).appendTooltip("quiverprops"),

            ovl.eye = $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-eye fa-1x'></i></div>").appendTooltip("showhide")
            .click(function(e) {
                ovl.toggle(e);
            }),
            $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-cog fa-1x'> </div>").appendTooltip("createroi")
            .click(ROIadder(ovl))
            .click(function() {
            // master.roiTool.pushROI(ovl.currentFileID,"untitled","upper"+ovl.histoManager.clim[0]);
            }),
            $createIso = $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-1x'>3D</i></div>").appendTooltip("isosurf").hide(),                                 
            $createFib = $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-tree fa-1x'></i></div>").appendTooltip("isosurf").hide(),                                 
            $captiondiv = $("<div  class='KViewPort_tool fibers caption'> " +filenameToShow + "</div>"),
            $("<div  class='KViewPort_tool KViewPort_tool_cmap overlay'>  <i class='fa fa-empty fa-1x'>&nbsp&nbsp&nbsp&nbsp</i></div>").appendTooltip("changecolormap")
            .click(ovl.histoManager.cmapSelectorMenu),
            $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>").appendTooltip("dragdropviewport"),
        ];

        if(ovl.nii.numTimePoints > 1)
        {
            var $timesliderDIV = $("<div  class='KViewPort_tool roi' style='padding:0px;height:21px'> </div>");
            var $timeinput = $("<input class='KViewPort_roiview_timeindicator KViewPort_tool roi' value='0' min='0'  style_='display:inline-block;width:25px'  class='KViewPort_tool roi' />").appendTo($timesliderDIV)
                .on('change', function(){ 
                    ovl.nii.currentTimePoint.t = $(this).val()   
                    signalhandler.send("updateImage",{id: ovl.content.fileID});
                });
            function timeinputwheel(ev, delta) { ev = ev.originalEvent || ev;var newval = parseInt($(this).val())+((ev.wheelDelta>0)?1:-1);if(newval >= 0 && newval <ovl.nii.numTimePoints) {$(this).val( newval ); $(this).trigger('change'); }ev.stopPropagation(); return false;  }
            $timeinput.bind("mousewheel", timeinputwheel);
                
            ovl.divs.splice(2, 0, $timesliderDIV);    
            ovl.$timeinput = $timeinput;
        }    



        ovl.$captiondiv = $captiondiv;
        $captiondiv.on('mouseenter',function(){			
               if (ovl.refSurfView)
               {
                   var obj = ovl.refSurfView;
                   obj.alphaMode = (obj.alphaMode+1)%6;
                   obj.update();
               }
        });
        $captiondiv.on('mouseleave',function(){	
               if (ovl.refSurfView)
               {
                   var obj = ovl.refSurfView;
                   obj.alphaMode = (obj.alphaMode+5)%6;
                   obj.update();
               }
        });
        $captiondiv.on('mousedown',function(ev){		
            if (ev.button == 2)
                showInfoContextNifti(ovl,ev)                
        });



        ovl.createFiberTrackingFromOvl = undefined;

        if (interpretAsColoredVolume(ovl.nii,ovl))
        {
            ovl.createFiberTrackingFromOvl = function() { return function(intent) {
                if (that.isGLenabled())
                    createfibview()
                else
                    toggle3D(undefined,createfibview);
                function createfibview()
                {
                    var filename = ovl.currentFilename.replace(".nii","").replace(".gz","") + ".tck";
                    var imageStruct = {filename:filename,content:{tracts:[  ]} }     ;  
                    intent.dirvolref = ovl;
                    intent.isParentView = true;  
                    var fv = master.obj3dTool.createFiberView(imageStruct,that,intent);
                    that.objects3D.push(fv);
                }
            } }();

            ovl.showcolored = true;
            $createFib.click( function() { ovl.createFiberTrackingFromOvl({}) });
        }
        else
        {
            $createFib.hide();
               ovl.showcolored = false;
        }

        if (intent && intent.createTracking && ovl.createFiberTrackingFromOvl)
        {
            setTimeout(function() { ovl.createFiberTrackingFromOvl(intent.createTracking) },50);
        }




        $createIso.click(function(ev) {            
            if ($createIso.onhold)
            {
                $createIso.onhold = undefined;
                return;
            }
            that.attachSurfaceRef(ovl,imageStruct);
        });

        $createIso.mousedown(function(ev)
        {
            if (ovl.refSurfView && !ovl.refSurfView.toolbarAttached)
            {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                var id = setTimeout(function()
                {
                    $createIso.onhold = true;
                    that.toolbar.append(ovl.refSurfView.divs,'surface')
                    ovl.refSurfView.toolbarAttached = true;

                },500);            
                $createIso.on("mouseleave mouseup",function(ev)
                {
                     clearTimeout(id);
                     $createIso.off("mouseleave mouseup");
                });
            }

        }    );

        if (imageStruct.editable)
        {
            attachNameDivHandler(imageStruct, $captiondiv, KViewer.cacheManager.update);

            var $savediv = $("<div  class='KViewPort_tool overlay'>  <i class='fa fa-save fa-1x'></i></div>")
            .appendTooltip("saveovl").click(function(o) {
                return function() {
                    tempObjectInfo = [{
                        type: 'file',
                        sid: imageStruct.fileinfo.studies_id,
                        piz: imageStruct.fileinfo.patients_id,
                        subfolder: '',
                        tag: '',
                        mime: 'nii',
                        filename: imageStruct.filename,
                        fileID: imageStruct.fileID
                    }];
                    KViewer.cacheManager.uploadFiles(that.viewport.progressSpinner, undefined);

                }
            }(ovl));
            ovl.divs.splice(2, 0, $savediv);

        }


        if ( ! (intent != undefined && intent.hideview ) )
             toolbar.append(ovl.divs, "overlay");
        else
             ovl.hideview = true;

        ovl.quiverdiv = $quiverdiv;
        $dragdiv.attr("draggable", 'true');
        $dragdiv.on("dragstart", dragstarter(function() {
            return {
                type: 'file',
                mime: 'nii',
                filename: ovl.currentFilename,
                fileID: ovl.currentFileID,
                intent: {
                    outlines:(ovl.outlines==undefined?undefined:ovl.color),
                    overlay: true,
                    cmap: ovl.histoManager.cmapindex,
                    clim: ovl.histoManager.clim
                },
                close: close
            }
        }));






        if (interpretAsColoredVolume(ovl.nii,ovl))
        {
            that.addQuiver(ovl.histoManager);
            $quiverdiv.show();
        }
        else
            $quiverdiv.hide();

        ovl.histoManager.name = imageStruct.filename;
        ovl.histoManager.cmapindex = 1;

        ovl.histoManager.blending = true;
        ovl.histoManager.nii = ovl.nii;
        ovl.histoManager.setColorMapLims = function(clim)
        {
            ovl.histoManager.saveSettings();
            ovl.histoManager.clim = clim.slice(0);
            ovl.histoManager.updateHistogramClim();
            that.drawSlice({
                mosaicdraw: true
            });
        }



        if (KViewer.defaults.overlay)
        {
            var d = KViewer.defaults.overlay;
            if (d.cmapindex != undefined)            
                ovl.histoManager.cmapindex = d.cmapindex;
            if (d.clim != undefined)            
                 ovl.histoManager.setColorMapLims(d.clim);
        }


        if(state.viewer.showOutlinesOverlay)
            ovl.outlines = Outlines(ovl);


        ovl.histoManager.onclimchange =
        function(ev)
        {
            signalhandler.send("overlay_climChange", {
                id: ovl.currentFileID,
                val: ovl.histoManager.clim,
                ev: ev
            });
        }

        ovl.histoManager.climchange_id = signalhandler.attach("overlay_climChange",
        function(event)
        {
            if (event.id == ovl.currentFileID)
            {
                
                ovl.histoManager.setColorMapLims(event.val);
                ovl.histoManager.clim_manually_modified = true; 
                if (ovl.surfacecolref)
                    ovl.surfacecolref.update();
            }
        });

        ovl.histoManager.cmapchange_id = ovl.histoManager.oncmapchange =
        function(ev)
        {
            signalhandler.send("overlay_cmapChange", {
                id: ovl.currentFileID,
                blend: ovl.histoManager.blending,
                cval: ovl.histoManager.cmapindex,
                showcolored : ovl.showcolored,
                showcolored_type : ovl.showcolored_type,
                ev: ev
            });
        }

        signalhandler.attach("overlay_cmapChange",
        function(event)
        {
            if (event.id == ovl.currentFileID)
            {
                if (ovl.histoManager.cmapindex != event.cval)
                {
                    ovl.histoManager.setCmap(event.cval);
                    that.drawSlice({
                        mosaicdraw: true
                    });
                }
                if (ovl.histoManager.blending != event.blend)
                {
                    ovl.histoManager.blending = event.blend;
                    that.drawSlice({
                        mosaicdraw: true
                    });
                }
                if (ovl.showcolored_type != event.showcolored_type)
                {
                    ovl.showcolored_type = event.showcolored_type;
                    that.drawSlice({
                        mosaicdraw: true
                    });
                }
                if (ovl.showcolored != event.showcolored)
                {
                    ovl.showcolored = event.showcolored;
                    that.drawSlice({
                        mosaicdraw: true
                    });
                }
                if (ovl.surfacecolref)
                    ovl.surfacecolref.update();

            }
        });


        if (imageStruct.mostRecentView != undefined)
        {
            var view = imageStruct.mostRecentView;
            ovl.showcolored = view.showcolored
            ovl.showcolored_type = view.showcolored_type
            ovl.histoManager.clim = view.histoManager.clim
            ovl.histoManager.cmapindex = view.histoManager.cmapindex
            ovl.histoManager.transparent = view.histoManager.transparent
            ovl.histoManager.posnegsym = view.histoManager.posnegsym
            ovl.histoManager.blocky = view.histoManager.blocky
        }    
        imageStruct.mostRecentView = ovl


        ovl.close = close;
        return ovl;

    }


    function appendObject3D(imageStruct, intent)
    {

            for (var k = 0; k < that.objects3D.length; k++) // avoid double insertion
            {
                var obj3d = that.objects3D[k];
                if ((obj3d.fibers && obj3d.fibers == imageStruct && intent.select == undefined))
                        return;
            }

        var fv = master.obj3dTool.createView(imageStruct, that, intent);
        if (!fv)
            return;
        that.objects3D.push(fv);
        KViewer.obj3dTool.addObject(imageStruct);

        if (imageStruct.contentType == 'gii')
        {
            signalhandler.send('surfcoldrop_' + that.viewport.viewPortID, {id:imageStruct.fileID});
        }


        return fv;
    }
    that.appendObject3D = appendObject3D;


    var exTimeout = function(fun,time)
    {
        if (fun.id !== undefined)
            clearTimeout(fun.id);
        fun.id = setTimeout(fun,time);					

    }


    function attachSurfaceRef(obj,fobj,progress,intent)
    {
        var viewer = that;
        if (obj.refSurfView == undefined)
        {
            $(this).addClass("current");
            function loadSurfIntoViewport(fobj)
            {
                function append() {
                    var alreadyInVP = false;
                    for (var k = 0; k < viewer.objects3D.length; k++)
                        if ( fobj.fileinfo.surfreference != undefined && viewer.objects3D[k].surf == fobj.fileinfo.surfreference)
                        {
                            alreadyInVP = true;
                            break;
                        }
                    if (!alreadyInVP)
                    {
                        var curRoiView = obj;
                        var intent_iso = {
                            color: curRoiView.color,
                            visible: obj.visible
                        };
                        if (intent != undefined)
                            intent_iso = $.extend(intent_iso,intent);
                        var surfView = viewer.appendObject3D(fobj,intent_iso);
                            
                        curRoiView.refSurfView = surfView;
                        if (intent && intent.toolbarAttached)
                            viewer.toolbar.append(surfView.divs,'surface')

                        surfView.refRoiView = curRoiView;
                    }
                }

                if (obj.type == 'overlay' | obj.type == 'mainview')
                {
                    fobj.toolbar_visible = false;
                    var which_clim = ""
                    if (obj.type == 'overlay')
                        which_clim = "overlay_"
                    else
                    {
                        fobj.toolbar_visible = true;
                    }
                    fobj.clim_updater =
                        signalhandler.attach(which_clim + "climChange",
                         function(event)
                            {
                                if (event.ev != undefined && event.ev.type == 'mousemove')
                                    return;
                                if (event.id == obj.currentFileID)
                                {
                                      KViewer.roiTool.update3D(obj,that.viewport.progressSpinner);
                                }
                            } );
                }                            


                if (!viewer.isGLenabled())
                    viewer.toggle3D(undefined, append);
                else
                    append();
            }

            var thres;
            if (obj.type == 'overlay' || obj.type == 'mainview')
                thres = obj.histoManager.clim[0];

            if (fobj.fileinfo.surfreference == undefined)
                KViewer.obj3dTool.createSurfaceFromROI(fobj, function() {
                    KViewer.dataManager.setFile(fobj.fileinfo.surfreference.fileID,fobj.fileinfo.surfreference);
                    KViewer.cacheManager.update();
                    loadSurfIntoViewport(fobj.fileinfo.surfreference); } ,thres,that.viewport.progressSpinner);
            else
            {
                loadSurfIntoViewport(fobj.fileinfo.surfreference);
                //KViewer.roiTool.update3D(obj,that.viewport.progressSpinner);
//                loadSurfIntoViewport(fobj.fileinfo.surfreference);
            }
           
        }
        else
        {
            if (obj.fileinfo)
                obj.fileinfo.surfreference = undefined;
            if (obj.roi && obj.roi.fileinfo)
               obj.roi.fileinfo.surfreference = undefined;
            KViewer.dataManager.delFile(obj.refSurfView.surf.fileID);
            KViewer.cacheManager.update();
            if (obj.refSurfView.surf.clim_updater)
            {
                var which_clim = ""
                if (obj.type == 'overlay')
                    which_clim = "overlay_"
                signalhandler.detach(which_clim + "climChange",obj.refSurfView.surf.clim_updater);
            }
            obj.refSurfView.close();
            obj.refSurfView = undefined;
            //fobj.fileinfo.surfreference = undefined;

            $(this).removeClass("current");
        }


    }
    that.attachSurfaceRef = attachSurfaceRef;


    function setContent(imageStruct, params)
    {
    
            if (!that.toolbar.issticky)
                that.toolbar.hide_addons();
            


            if (typeof KAtlasTool != "undefined")
            if ((KAtlasTool.isAtlas(imageStruct) | params.intent.atlas) & !params.intent.overlay & !params.intent.surfcol)
            {

                    if (params.intent.atlaskey != undefined) // this is auto roi convert
                    {
                       var bgnd = imageStruct;
                       if (that.content != undefined & !that.nii.dummy)
                       {
                           if (math.abs(math.det(imageStruct.content.edges))
                               < math.abs(math.det(that.content.content.edges)))
                               bgnd = that.content;
                       }
                       KViewer.atlasTool.getROIfromSinglelabel(imageStruct,params.intent.atlaskey,params.intent.labelname,
                                                               bgnd, // on this matrix the roi is rendered
                                                               function(roi){
                             that.viewport.setContent(roi,params);
                       }, that.viewport.progressSpinner)                        
                       return;
                    }
                    else
                    {

                        imageStruct = KViewer.atlasTool.addAtlas(imageStruct);
                        if (imageStruct == undefined)
                            return;
                        if (params.intent.atlasiso != undefined)
                        {
                             KViewer.atlasTool.attachSurf(imageStruct,imageStruct.content.labels[params.intent.atlasiso],that);
                             return;
                        }
                        else
                        {
                            for (var k = 0; k < that.atlas.length; k++)
                            {
                                if (that.atlas[k].atlas.fileID == imageStruct.fileID)
                                    return;
                            }

                            var av = KViewer.atlasTool.createView(imageStruct, that,params.intent);

                            if (params.intent.surfcol)
                            {

                                function closure(params,av,imageStruct)
                                {
                                    function attachAtlasCol(id)
                                    {
                                        var sviews = hasContent('surf');
                                        if (sviews == undefined)
                                        {
                                            return false;
                                        }

                                        var thesurfview
                                        for (var k = 0; k < sviews.length;k++)
                                        {
                                            if (sviews[k].surf.fileID == id)
                                            {
                                                thesurfview = sviews[k];
                                                break;
                                            }
                                        }
                                        if (thesurfview == undefined)
                                        {
                                            return false;
                                        }
                                        av.surfacecolref = thesurfview;
                                        thesurfview.overlays.push(av);
                                        thesurfview.update();                                    
                                        return true
                                    }                             


                                    if (!attachAtlasCol(params.intent.surfcol))
                                    {
                                        var sid = signalhandler.attach('surfcoldrop_' + that.viewport.viewPortID,function(e)
                                        {
                                                if (attachAtlasCol(params.intent.surfcol))
                                                   signalhandler.detach('surfcoldrop_' + that.viewport.viewPortID,sid);
    //                                                setTimeout(function() { signalhandler.detach('surfcoldrop_' + that.viewport.viewPortID,'all'); },0);
                                        }); 
                                    }   
                                }
                                closure(params,av,imageStruct)
                                return;                         
                            }
                            else
                            {

                                that.atlas.push(av);
                                that.drawSlice({
                                    mosaicdraw: true
                                });

                            }
                            if (that.currentFileID != undefined)
                                return;
                            else
                            {
                                KViewer.atlasTool.toggleAllLabels(imageStruct,true);
                            }
                        }
                    }
            }

            viewport.setCurrentViewer(that);

            if (imageStruct.contentType == 'rtstruct')
            {
                if (Array.isArray(imageStruct.content.Contours) && params.intent.select == undefined)
                    for (var k= 0;k < imageStruct.content.Contours.length;k++)
                        appendObject3D(imageStruct, $.extend(params.intent,{select:k}));
                else
                    appendObject3D(imageStruct, params.intent);
                signalhandler.send('positionChange');

                return;
            }

            if (imageStruct.contentType == 'tracts' | imageStruct.contentType == 'gii' |  imageStruct.filename.search("\\.cc.json") != -1)
            {
                if (that.content == undefined)
                {
                    if (KViewer.lastDummyNifti == undefined)
                    {
                        KViewer.lastDummyNifti = createDummyNifti([100,100,100],imageStruct.content.max,imageStruct.content.min,[0,1,2],[1,1,1]);
                    }
                    that.nii = KViewer.lastDummyNifti;
                    that.content = {content:that.nii};
                    niiOriginal = that.nii;
                }

                for (var k = 0; k < that.objects3D.length; k++) // avoid double insertion
                {
                    var obj3d = that.objects3D[k];
                    if ((obj3d.surf && obj3d.surf == imageStruct))
                            return;
                }

                if (webgl_detect())
                {
                    var load3DObject = function() {
                        if (params.intent == undefined)
                            params.intent = {};

                        if (imageStruct.content.selections != undefined & 
                            (params.intent.subset_to_open != undefined | params.intent.select == 'allselections'))
                        {


                            var list_to_sort = []
                            for (var j = 0; j < imageStruct.content.selections.length;j++)
                                {
                                    var add = true;
                                    if (params.intent.subset_to_open != undefined && params.intent.subset_to_open[0] != "allselections")
                                    {
                                        if (params.intent.subset_to_open.filter((x)=> x==imageStruct.content.selections[j].name).length == 0)
                                            continue;
                                    }
                                    list_to_sort.push({id:j,name:imageStruct.content.selections[j].name})
                                }

                            list_to_sort.sort(function(a,b) {return (a.name > b.name)?-1:1 })

                            for (var j_ = 0; j_ < list_to_sort.length;j_++)
                            {
                                var k = list_to_sort[j_].id;

                                var col = k;
                                if (imageStruct.content.selections[k].color != undefined)
                                    col = imageStruct.content.selections[k].color;
                                var intent = { select: k, color: col};
                                if (params.intent.color != undefined)
                                    intent.color = params.intent.color;
                                if (params.intent.visible != undefined)
                                    intent.visible = params.intent.visible;
                                if (params.intent.colmode != undefined)
                                    intent.colmode = params.intent.colmode;
                                appendObject3D(imageStruct, intent);
                            }
                        }
                        else
                        {
                            if (Array.isArray(imageStruct.content.Contours) && params.intent.select == undefined)
                                for (var k= 0;k < imageStruct.content.Contours.length;k++)
                                    appendObject3D(imageStruct, $.extend(params.intent,{select:k}));
/*                            else if (Array.isArray(params.intent.select))
                            {
                                var toselect = params.intent.select;
                                for (var k= 0;k < toselect.length;k++)
                                    appendObject3D(imageStruct, $.extend(params.intent,{select:toselect[k]}));                            
                            }*/
                            else
                                appendObject3D(imageStruct, params.intent);
                        }
                        if (KViewer.areControlsVisible())
                            that.showControls();
                        setCanvasLayout();
                        resliceOnMaster();
                    }
                    if (!gl_enabled)
                    {
                        if (KViewer.areControlsVisible())
                            that.showControls();
                        toggle3D(undefined,function() {
                            if (that.viewport.onsetContent)
                                that.viewport.onsetContent();
                            load3DObject()
                            that.gl.setprops(params.intent.gl_props);
                        })
                    }
                    else
                        load3DObject();

                }
                else
                    alertify.error("Your browser has no WebGL enabled!")
                return;
            }



//	position:[ -3.1,4.6,-3.2]


            if (params.intent)
            {
                if (params.intent.position)
                {
                    var p = params.intent.position
                    setTimeout(function(){
                            setWorldPosition(math.matrix([p[0],p[1],p[2],1]))
                            signalhandler.send("centralize")             },0);
                }


                if (params.intent.createFiberTracking)
                {
                    if (gl_enabled)
                        openFiberTracking()
                    else
                        toggle3D(undefined, openFiberTracking);
                    return;

                    function openFiberTracking()
                    {
                        var filename = imageStruct.filename.replace(".nii","").replace(".gz","") + ".tck";
                        var view_on_trackvol;
                        if (that.content.fileID == imageStruct.fileID)
                            view_on_trackvol = that;
                        else
                        {
                            for (var k = 0; k < that.overlays.length;k++)
                            {
                                if (that.overlays[k].currentFileID == imageStruct.fileID)
                                {
                                   view_on_trackvol = that.overlays[k];
                                   break;
                                }
                            }
                        }

                        if (params.intent.createFiberTracking.viewport != undefined) // if the view is somewhere else
                            view_on_trackvol = params.intent.createFiberTracking;


                        if (view_on_trackvol == undefined)
                        {
                            alertify.error("associated contrast for tracking not found");
                            return;
                        }

                        var new_imageStruct = {filename:filename,content:{tracts:[  ]} }     ;  

                        var intent = { dirvolref: view_on_trackvol ,isParentView:true } ;
                        intent = $.extend(intent,params.intent.createFiberTracking);
                           
                        var fv = master.obj3dTool.createFiberView(new_imageStruct,that,intent);
                        that.objects3D.push(fv);
                        return;
                    }
                }

                if  (params.intent.quiver_params)
                    imageStruct.content.quiver_params = params.intent.quiver_params;


                if (params.intent.slicing == 'gl' | params.intent.slicing == -1)
                {
                    params.intent.gl = true;
                    params.intent.slicing = 0;
                }

                //if ( (params.intent.ROI | params.intent.roi) &&  (imageStruct.content.datatype != 'uint8') ||   imageStruct.content.datatype != 'uint16') 
                if (0) // (params.intent.ROI | params.intent.roi) &&  (imageStruct.content.datatype == 'float'))
                {
                    alertify.error('ROI-filetype was "'+ imageStruct.content.datatype +'", cannot work with this directly, please create ROI manually with thresholding.')
                    params.intent.ROI = false;
                    params.intent.roi = false;

                }



                if (params.intent.ROI | params.intent.roi)
                {
                    for (var k = 0; k < that.ROIs.length; k++)
                    {
                        // check if roi is already loaded
                        if (that.ROIs[k].roi.fileID == imageStruct.fileID)
                            return;
                    }
                    // no background image in this viewport
                    if (that.currentFileID == undefined)
                    {
                        //if( !params.intent.isosurf )
                        //    alertify.error('You dropped a ROI, but there was no background image.<br>I set this ROI also as background. Drop other image if desired.');
                        //alertify.error('Please drop a background image first');
                        //viewport.setCurrentViewer();
                        //return;
                        var goOnAndloadasBackground = true;
                    }
//todoMRC

                    function doit(fobj)
                    {
                        var fv = master.roiTool.createView(fobj, that, params.intent);
                       
                        if (params.intent && params.intent.ccanalysis && fobj.ccanalysis == undefined) 
                            createConnCompAnalysis(fobj);

                        if (params.intent && params.intent.moving == 1)
                        {
                            KViewer.navigationTool.movingObjs[fobj.fileID] = fobj;
                            KViewer.navigationTool.updateMoving();                        
                        }


                        if (notzipped)
                            fobj.notzipped = true;

                        that.ROIs.push(fv);
                        that.drawSlice({
                            mosaicdraw: true
                        });

                        if (params.intent.makeCurrent && !fv.isCurrent)
                            fv.makeCurrent();

                        $timediv.update();
                    }

                    var notzipped = false
                    if (imageStruct.fileID.substring(0,3) != "ROI")
                    {
                        
                        if (imageStruct.fileinfo.Filename == undefined)
                            notzipped = true;
                        else if (imageStruct.fileinfo.Filename.search("\\.gz") == -1)
                            notzipped = true;
                    }

                    if (params.intent.roilim | imageStruct.content.datatype != 'uint8' | imageStruct.content.filetype == 'nrrd')
                    {
                        var threshold = params.intent.roilim
                        if (threshold == undefined)
                        {
                            threshold = 0;
                            alertify.error('nifti cloned, mask need uint8 datatype')
                        }
                        var name  = imageStruct.filename.replace("\.nii","").replace("\.gz","")
                        if (name.search("\.nrrd") != -1 | name.search("\.mgh") != -1| name.search("\.mgz") != -1)
                            notzipped = false;
     

                        name = name.replace("\.nrrd","").replace("\.mgh","").replace("\.mgz","")
                        imageStruct.intendedROIid = imageStruct.fileID;
                        master.roiTool.pushROI(imageStruct.fileID, name, "upper" + imageStruct.content.datascaling.ie(threshold),
                        function(fobj) {
                            fobj.fileinfo.SubFolder = imageStruct.fileinfo.SubFolder;
                            fobj.fileinfo.Filename = imageStruct.fileinfo.Filename;
                            doit(fobj);

                            },undefined,{sametdim:true});
                    }
                    else
                    {

                        if (KViewer.roiTool.ROIs[imageStruct.fileID] != undefined )
                        {
                            doit(KViewer.roiTool.ROIs[imageStruct.fileID])
                            if (!goOnAndloadasBackground)
                                return;
                        }
                        else
                            master.roiTool.pushROI(imageStruct.fileID, "untitled", "frommaskfile",doit);
                    }


                    if(goOnAndloadasBackground == undefined)
                        return;
                }



                if ((params.intent.ctrlKey | params.intent.overlay) & that.nii != undefined & params.intent.surfcol == undefined)
                {

                    for (var k = 0; k < that.overlays.length; k++) // check if ovl already in VP
                    {
                        if (that.overlays[k].content.fileID == imageStruct.fileID)
                            return;
                    }
                    var newovl = createOverlay(imageStruct,params.intent);
                   
                    newovl.histoManager.clim = [newovl.nii.histogram.min + 0.5 * (newovl.nii.histogram.max - newovl.nii.histogram.min),
                                                newovl.nii.histogram.max - 0.1 * (newovl.nii.histogram.max - newovl.nii.histogram.min)];

                    newovl.histoManager.loadSettings(imageStruct)
                    
                    if (KViewer.defaults.overlay)
                    {
                        var d = KViewer.defaults.overlay;                        
                        if (d.clim != undefined)            
                             newovl.histoManager.clim = [imageStruct.content.datascaling.ie(d.clim[0]),imageStruct.content.datascaling.ie(d.clim[1])];
                    }

              
                    if(imageStruct.content.cal_max!=imageStruct.content.cal_min)
                    {
                        newovl.histoManager.clim = [imageStruct.content.datascaling.ie(imageStruct.content.cal_min), imageStruct.content.datascaling.ie(imageStruct.content.cal_max)];
                    }
                    
                    if (imageStruct.content.descrip && imageStruct.content.descrip.clim)
                        newovl.histoManager.clim = [imageStruct.content.descrip.clim[0],imageStruct.content.descrip.clim[1]];

              

                    if (params.intent.clim != undefined)
                        newovl.histoManager.clim = params.intent.clim;
                    if (params.intent.windowing != undefined)
                        newovl.histoManager.clim = newovl.histoManager.nii.datascaling.ie(params.intent.windowing)
                    if (params.intent.visible != undefined)
                    {
                        newovl.visible = params.intent.visible;
                        if (!newovl.visible)
                            newovl.eye.css('color', 'red');
                    }
                    if (params.intent.moving == 1)
                    {
	                    KViewer.navigationTool.movingObjs[fobj.fileID] = fobj;
						KViewer.navigationTool.updateMoving();                        
                    }
                    if (params.intent.cmap != undefined)
                        newovl.histoManager.setCmap(params.intent.cmap);
                    if (params.intent.transparent != undefined)
                        newovl.histoManager.blending = params.intent.transparent;
                    if (params.intent.posnegsym != undefined)
                        newovl.histoManager.posnegsym = params.intent.posnegsym;
                    if (params.intent.blocky != undefined)
                        newovl.histoManager.blocky = params.intent.blocky;
                    if (params.intent.initialTimePoint != undefined)
                        newovl.nii.currentTimePoint.t = parseInt(params.intent.initialTimePoint);
                    else
                    {
                        if (newovl.nii.numTimePoints > KViewer.movie.currentTimePoint)
                        {
                           newovl.nii.currentTimePoint.t = KViewer.movie.currentTimePoint;
                           $timeinput.val( newovl.nii.currentTimePoint.t  );
                           $timeCurrent.text(  newovl.nii.currentTimePoint.t );

                        }
                    }

                    if (params.intent.isosurf)// || newovl.fileinfo.surfreference )                                            
                    {
                        that.attachSurfaceRef(newovl,imageStruct, undefined,params.intent.isosurf );
                    }
                    if (params.intent.quiver_params)
                          newovl.nii.quiver_params = params.intent.quiver_params;

                    signalhandler.send("layoutHisto");


                    if (params.intent)
                    {
                        if (params.intent.showcolored != undefined)
                            newovl.showcolored = params.intent.showcolored;
                        if (params.intent.showcolored_type != undefined)
                            newovl.showcolored_type = params.intent.showcolored_type;

                        if (params.intent.outlines != undefined)
                        {
                            newovl.color = params.intent.outlines;
                            newovl.outlines = Outlines(newovl);
                        }
                    }

                    



                    that.overlays.push(newovl);
                    $timediv.update();

                    that.drawSlice({
                        mosaicdraw: true
                    });
                    return;
                }

                if (params.intent.surfcol)
                {

                    function closure(imageStruct,params)
                    {

                        var sviews = hasContent('surf');
                        if (!createSurfColoring(sviews,params.intent.surfcol,imageStruct))
                        {
                            var sid = signalhandler.attach('surfcoldrop_' + that.viewport.viewPortID,function(e)
                            {
                                    if (createSurfColoring(sviews,params.intent.surfcol,imageStruct))                      
                                        signalhandler.detach('surfcoldrop_' + that.viewport.viewPortID,sid);
                            });
                        }

                        function createSurfColoring(sviews,surfid,imageStruct)
                        {

                            var sviews = hasContent('surf');
                            if (sviews == undefined)
                                return false;

                            var surfviews;
                            if (surfid == "all")
                            {
                                surfviews = sviews;
                            }
                            else
                            {
            
                                var thesurfview_ = undefined
                                for (var k = 0; k < sviews.length;k++)
                                    if (sviews[k].surf.fileID == surfid)
                                    {
                                        thesurfview_ = sviews[k]
                                        break;
                                    }
                                if (thesurfview_ == undefined)
                                    return false;
                                surfviews = [thesurfview_];
                            }

                            
                            for (var k = 0; k < surfviews.length;k++) 
                            {
                                ((thesurfview) => {
                                var newovl = createOverlay(imageStruct);
                                
                                newovl.surfacecolref = thesurfview;
    
    
                                thesurfview.overlays.push(newovl);
    
    
                                newovl.histoManager.clim = [newovl.nii.histogram.min + 0.5 * (newovl.nii.histogram.max - newovl.nii.histogram.min),
                                newovl.nii.histogram.max - 0.1 * (newovl.nii.histogram.max - newovl.nii.histogram.min)];

                                newovl.histoManager.loadSettings(imageStruct)

                                if (KViewer.defaults.overlay)
                                {
                                    var d = KViewer.defaults.overlay;                        
                                    if (d.clim != undefined)            
                                         newovl.histoManager.clim = [imageStruct.content.datascaling.ie(d.clim[0]),imageStruct.content.datascaling.ie(d.clim[1])];
                                }                        
    
    
                                if (imageStruct.content.descrip && imageStruct.content.descrip.clim)
                                    newovl.histoManager.clim = [imageStruct.content.descrip.clim[0],imageStruct.content.descrip.clim[1]];
    
    
    
                                if (params.intent.posnegsym)
                                    newovl.histoManager.posnegsym = params.intent.posnegsym;
                                if (params.intent.clim)
                                    newovl.histoManager.clim = params.intent.clim;
                                if (params.intent.windowing != undefined)
                                    newovl.histoManager.clim = newovl.histoManager.nii.datascaling.ie(params.intent.windowing)
    
                                if (params.intent.cmap != undefined)
                                    newovl.histoManager.setCmap(params.intent.cmap);
                                if (params.intent.cuts != undefined)
                                    thesurfview.cuts = params.intent.cuts; 
                                newovl.histoManager.onclimchange = 
                                 function(ev)
                                    {
                                        signalhandler.send("overlay_climChange", {
                                            id: newovl.currentFileID,
                                            val: newovl.histoManager.clim,
                                            ev: ev
                                        });
                                        thesurfview.update();
                                        newovl.histoManager.saveSettings()
    
                                    }
                                newovl.histoManager.oncmapchange = function(ev)
                                        {
                                           signalhandler.send("overlay_cmapChange", {
                                                        id: newovl.currentFileID,
                                                        blend: newovl.histoManager.blending,
                                                        cval: newovl.histoManager.cmapindex,
                                                        showcolored : newovl.showcolored,
                                                        showcolored_type : newovl.showcolored_type,
                                                        ev: ev
                                              });
                                            thesurfview.update();
                                            newovl.histoManager.saveSettings()
                                                
                                        }
                                newovl.customClose = function()
                                {
                                    for (var k = 0; k < thesurfview.overlays.length; k++)
                                        if (this == thesurfview.overlays[k])
                                        {
                                            thesurfview.overlays.splice(k, 1);
                                            break;
                                        }
                                    thesurfview.colors_mapped = undefined;
                                    thesurfview.update();
    
                                }
                                thesurfview.update();
    
                                signalhandler.send("layoutHisto");
                             })(surfviews[k])
                            }
                            return true;
                        }
                        return;

                    }
                    closure(imageStruct,params);
                    return;
                }


            }

            var cpoint = getWorldPosition(); 

            var old_hc_pos_x
            var old_hc_pos_y
            if (that.nii != undefined) // save old crosshair position
            {
                var x = getCanvasCoordinates(cpoint);
                var cpos = that.$canvas.offset();
                cpos.top -= that.$container.offset().top;
                cpos.left -= that.$container.offset().left;
                old_hc_pos_x = x.x_pix + cpos.left
                old_hc_pos_y = x.y_pix + cpos.top

                if (old_hc_pos_x <0 | old_hc_pos_x > that.$container.width()
                   | old_hc_pos_y <0 | old_hc_pos_y > that.$container.height())
                {
                    old_hc_pos_x = that.$container.width()/2;
                    old_hc_pos_y = that.$container.height()/2;
                }

            }

            if (that.nii && that.nii.dummy && that.gl != undefined)
            {
                that.gl.setPlanesVisibility([1,1,1])
            }


            that.nii = imageStruct.content;

            that.prepViewer(imageStruct,params.intent);

            niiOriginal = that.nii;

            that.niiOriginal = niiOriginal;
            histoManager.nii = that.nii;
            histoManager.name = imageStruct.filename;
            histoManager.setColorMapLims = setColorMapLims;

            if (params.intent)
            {
                if (params.intent.gl & webgl_detect())
                {
                    if (!gl_enabled)
                        toggle3D(undefined,function() {
                            that.gl.setprops(params.intent.gl_props);
                            if (that.viewport.onsetContent)
                                that.viewport.onsetContent();
                        });
                }
                else if (params.intent.gl == false)
                {
                    if (gl_enabled)
                        toggle3D();
                }
            }

            if (params.intent)
            {
                if (params.intent.slicing != undefined)
                    slicingDimOfWorld = params.intent.slicing;
                if (params.intent.isosurf)
                     setTimeout(function(){  that.attachSurfaceRef(that,that.content,undefined,params.intent.isosurf);    });
            }

            if (params.intent != undefined & params.mosaic == undefined)
                params.mosaic = params.intent.mosaic;
            if (params.mosaic)
            {
                that.mosaicview = $.extend(that.mosaicview,params.mosaic);
                that.mosaicview.clipratio.mosaic = true;
                that.switchToMosaic()
            }


            quiver.clear();
            if (interpretAsColoredVolume(that.nii,that))
            {
                that.addQuiver(histoManager);
                that.toolbar.$quiver.show();
            }

            if (!KViewer.areControlsVisible())
               params.intent.hideControls = true;


            if(params.intent && params.intent.hideControls)
                that.hideControls(params.intent.hideControls);  
            else
                that.showControls();

            toolbar.$dragdiv.off("dragstart");
            toolbar.$dragdiv[0].ondragstart = dragstarter(function() {
                if (that.currentFileID != undefined)
                  return {
                    type: 'file',
                    mime: 'nii',
                    filename: that.currentFilename,
                    fileID: that.currentFileID,
                    fromViewPort : that.viewport.viewPortID,
                    intent: {
                        clim: that.histoManager.clim,
                        hcpos:getCanvasCoordinates(getWorldPosition())
                    },
                    close: that.close
                }

            })


            var nii = that.nii;

            // for single slice images, set slicing dim such that it becoms visible
            if( nii.sizes[0] == 1 || nii.sizes[1] == 1 || nii.sizes[2] == 1)
            {
                applySlicingDimOfArray( nii.sizes.indexOf(1) )
                worldLockedToMaster = true;
            }
            else
                worldLockedToMaster = true;            


            
            that.showcolored = interpretAsColoredVolume(nii,that);
                
            if (params.intent)
            {
                if (params.intent.worldLockedToMaster != undefined)
                    worldLockedToMaster = params.intent.worldLockedToMaster;
                if (params.intent.showcolored != undefined)
                    that.showcolored = params.intent.showcolored;
                if (params.intent.showcolored_type != undefined)
                    that.showcolored_type = params.intent.showcolored_type;
            }


            currentVoxel = math.matrix(nii.centerVoxel);

            // remember center point as custom point 
            customPoint  = math.matrix(nii.centerWorld);
            
            var cpoint = getWorldPosition(); // if global coordinates off, this will return the local center, as it was set above with "customPoint"
            if (cpoint == undefined || cpoint.reset)
            {
                cpoint = customPoint;
                if ($container.height() > 0)
                {
                    old_hc_pos_x = $container.width()/2;
                    old_hc_pos_y = $container.height()/2;
                }
                setWorldPosition(customPoint)
            }

            var reset = false;


            var flatmap = KAtlasTool.isFlatMap(imageStruct);
            if (flatmap != that.isFlatMap)            
                reset = true;
            that.isFlatMap = flatmap;

            if (master.mainViewport !== -1)
                    cpoint = math.multiply(math.inv(master.reorientationMatrix.matrix), cpoint);
            
            // check if image is outside: if yes set the global point to the center of this nifti
            var curV_ = math.multiply(math.inv(nii.edges), cpoint)._data;
            if(reset || curV_[0]<-0.001 || curV_[1]<-0.001 || curV_[2]<-0.001 || curV_[0]>=nii.sizes[0]+0.001 || curV_[1]>=nii.sizes[1]+0.001 || curV_[2]>=nii.sizes[2]+0.001 )
            {
                if (!goOnAndloadasBackground)
                {
                    setWorldPosition(customPoint);
                    old_hc_pos_x = undefined;
                    old_hc_pos_y = undefined;
                    signalhandler.send("positionChange");
                 //   center();
                }
            }
            else
            {

            }

            // remember viewcenter (old or new)
            if (!goOnAndloadasBackground)
            {
                 // what is this
                  master.viewcenter = math.multiply(nii.edges, currentVoxel);
            }

            if (that.toolbar.$mainViewportSelector.hasClass("KViewPort_tool_enabled"))
            {
                master.toggleMainViewport(-1);                
                master.toggleMainViewport(that.viewport.viewPortID);                
            }


             if (params.intent)
            {
                
                if (params.intent.clim != undefined)
                    var tempClim = params.intent.clim;
                if (params.intent.windowing != undefined)
                    var tempClim = histoManager.nii.datascaling.ie(params.intent.windowing)
                    
                if (params.intent.cmap != undefined & !params.intent.overlay)
                    histoManager.setCmap(params.intent.cmap);
            }


            { // clim handling 
                    if (tempClim) // intent had the clim set. now check if it was absolute or in percent for histogram, for auto windowing from histogram.
                    {
                        for (var z = 0; z < 2; z++)
                        {
                            if (typeof (tempClim[z]) == "string") // is a string
                            {
                                if (tempClim[z].search("%") !== -1) // string an with percent --> percantage of histos
                                {
                                    var pp = parseFloat(tempClim[z]) / 100;
                                    if (z == 0)
                                        // lower bound
                                        histoManager.clim[z] = nii.histogram.min + pp * (nii.histogram.max - nii.histogram.min);
                                    else
                                        // upper
                                        histoManager.clim[z] = nii.histogram.max - pp * (nii.histogram.max - nii.histogram.min);
                                }
                            }
                            else
                                histoManager.clim[z] = parseFloat(tempClim[z]);
                            // else, absolute values given
                        }

                    }
                    // default windowing might be set in nifti 
                    else if(nii.cal_max && (nii.cal_max!=nii.cal_min))
                    {
                        histoManager.clim = [nii.datascaling.ie(nii.cal_min), nii.datascaling.ie(nii.cal_max)];
                    }
                    else // no clim set. Take standard auto windowing from histogram
                    {
                        if (nii.descrip.clim)
                            histoManager.clim = [nii.descrip.clim[0],nii.descrip.clim[1]];
                        else
                        {
                            var minPerc = 0;
                            var maxPerc = 0.05;

                            var lowerlim = nii.histogram.min + minPerc * (nii.histogram.max - nii.histogram.min);
                            // set lowerlim always to zero ( account the intercept in nii)
                            //if( nii.scl_inter < 0 && nii.scl_slope != 0)
                            //    lowerlim = -nii.scl_inter/nii.scl_slope;
                            //else
                            //    lowerlim = 0;

                            if (interpretAsColoredVolume(that.nii,that))
                                lowerlim = 0;


                            var upperlim = nii.histogram.max - maxPerc * (nii.histogram.max - nii.histogram.min);

                            histoManager.clim = [lowerlim, upperlim];
                            histoManager.loadSettings(imageStruct)


                        }
                    }

                    if (params.intent.transfactor != undefined)
                        that.transfactor = params.intent.transfactor;

                    setColorMapLims(histoManager.clim);
            }



            resliceOnMaster();

            var coords = getCanvasCoordinates(getWorldPosition());

            if (old_hc_pos_x != undefined)
            {
                var dy = coords.y_pix+that.heioffs_px*that.zoomFac-old_hc_pos_y
                var dx = coords.x_pix+that.widoffs_px*that.zoomFac-old_hc_pos_x;
                setZoomLims([that.zoomFac, dy, dx]);

            }


            if (nii.descrip.cmap > 0)
                    histoManager.setCmap(nii.descrip.cmap);
 
            if (params.intent && params.intent.initialTimePoint != undefined)
            {
                if(that.nii.numTimePoints > parseInt(params.intent.initialTimePoint))
                    that.nii.currentTimePoint.t = parseInt(params.intent.initialTimePoint);
            }
            else
            {
                if (that.nii.numTimePoints > KViewer.movie.currentTimePoint)
                {
                    that.nii.currentTimePoint.t = KViewer.movie.currentTimePoint;
                    $timeinput.val( that.nii.currentTimePoint.t  );
                    $timeCurrent.text(  that.nii.currentTimePoint.t );                    
                }
            }
     



            if (KViewer.roiTool && KViewer.roiTool.isinstance && KViewer.roiTool.roiPanel)
                KViewer.roiTool.roiPanel.update();
            drawHairCross();
            updateInfoBar();


            $timeinput.val( that.nii.currentTimePoint.t  );
            $timeCurrent.text(  that.nii.currentTimePoint.t );



            if (params.intent.zooms != undefined)
            {
                that.setZoomLims([params.intent.zooms[0], params.intent.zooms[1] * containerHeight(), params.intent.zooms[2] * containerWidth()],true);
            }
            else
            {
                var zlims = [1,0,0]
                if (master.zoomLims[slicingDimOfWorld] != undefined)
                {
                    zlims = master.zoomLims[slicingDimOfWorld]
                   //thishere
                    var cx = coords.x_pix+math.round(that.widoffs_px * that.zoomFac - that.zoomOriginX);
                    var cy = coords.y_pix+math.round(that.heioffs_px * that.zoomFac - that.zoomOriginY);
                    var fac = zlims[0]/that.zoomFac;      
                    var zlims2 = [fac * that.zoomFac, (that.zoomOriginY + cy) * fac - cy,(that.zoomOriginX + cx) * fac - cx]
                    that.setZoomLims(zlims2,true);
                    return;
                }
                else
                {
                    for (var k = 0; k < 3; k++)
                        if (master.zoomLims[k] != undefined)
                        {
                            setZoom(master.zoomLims[k][0])
                            return;
                        }
                }

                
            }


        }// end of set content

        function updateInfoBar()
        {
            if (master.showInfoBar)
            {
                if (that.nii)
                {
                    if (that.nii.type !== 'nii')
                        // do not update info bar for unnsupported types
                        return;


                    if (!master.showInfoBar)
                    {
                        txt = "";
                    }
                    else
                    {
                        var nii = that.nii;
                        $infobar.on("dragstart",
                        function(ev)
                        {
                            tempObjectInfo = [{
                                type: 'file',
                                sid: '',
                                piz: '',
                                subfolder: '',
                                tag: '',
                                mime: 'nii',
                                filename: that.currentFilename,
                                fromViewPort : that.viewport.viewPortID,
                                
                                fileID: that.currentFileID,
                                intent: {
                                    clim: that.histoManager.clim,
                                    viewport: that.viewport.viewPortID
                                    }

                            }];
                            if (ev.originalEvent !== undefined)
                                ev.originalEvent.dataTransfer.setData("fromfiletable", "yea");
                            else
                                ev.dataTransfer.setData("fromfiletable", "yea");
                        });


                        function mapVal(nii, val)
                        {
                            var value;
                            if (val != undefined)
                            {
                                if (Array.isArray(val))
                                {
                                    value = "[";
                                    for (var i in val)
                                    {
                                        if (i>0)
                                            value += " "
                                        value += nii.datascaling.e(val[i]).toFixed(2);
                                    }
                                    value = value.trim() + "]"
                                }
                                else
                                {

                                    if (!(nii.datascaling.id()))
                                    {
                                        value = (nii.datascaling.e(val)).toFixed(4);
                                        value += " (" + val.toFixed(4) + ")";
                                    }
                                    else
                                        value = val.toFixed(4);
                                }
                                if (nii.descrip && nii.descrip.unit)
                                    value += " " + nii.descrip.unit.slice(5);

                            }
                            else
                                value = "undefined";
                            return value;
                        }

                        var msz = "";
                        msz = "matrix: " + nii.sizes[0].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[1].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[2].toFixed(0);
                        if (nii.sizes.length > 3 && (nii.sizes[3] > 1 | nii.sizes[3] > 1))
                            msz += ';&nbsp;' + nii.sizes[3].toFixed(0);
                        if (nii.sizes.length > 4 && nii.sizes[4] > 1)
                            msz += ';&nbsp;' + nii.sizes[4].toFixed(0);

                        if (nii.currentTimePoint.t != 0)
                            msz += "  (t:" + (nii.currentTimePoint.t + 1) + ")";



                        if (that.currentFileinfo)
                        {
                            if (that.currentFileinfo.patients_id == undefined)
                                var psid = "no associated patient";
                            else
                                var psid = that.currentFileinfo.patients_id + "_" + that.currentFileinfo.studies_id + "<br>";
                        }
                        else
                            var psid = "localfile <br> ";
                        if (userinfo.username == guestuser)
                            psid = "";


                        var value = mapVal(nii, currentValue);
                        for (var k = 0; k < that.overlays.length; k++)
                        {
                            value += "; " + mapVal(that.overlays[k].nii, that.overlays[k].currentValue);
                        }

                        var txt = "<span style='font-size:11px;line-height:13px'><b>";
                        if (that.currentFileinfo.SubFolder != undefined && that.currentFileinfo.SubFolder !="")
                             txt +=  that.currentFileinfo.SubFolder + '/' + that.currentFilename + '<br>'   ;
                        else
                             txt +=  that.currentFilename + '<br>'   ;
                        
                        txt += "</b>" + psid;

                        // print the date nicely
                        /*
                        var sid = that.currentFileinfo.studies_id;
                        if (sid != undefined)
                        {
                            var dd = sid.substring(7,9) + "." +sid.substring(5,7)+"."+sid.substring(1,5);
                            txt += "</b>" + psid.split('_#')[0] + " <b>" + dd + "</b>";
                        }*/
                    

                        txt += "</span>";
                        txt += "<span style='font-size:3px;line-height:3px'><br></span>";



                        txt +=  "voxsize: " + nii.voxSize[0].toFixed(2) + '&nbsp;&nbsp;' + nii.voxSize[1].toFixed(2) + '&nbsp;&nbsp;' + nii.voxSize[2].toFixed(2)
                            + "<br>" + msz ;

                        var p = getWorldPosition();
                        txt += "<br>pos mm: " + p._data[0].toFixed(1) + '&nbsp;&nbsp;' + p._data[1].toFixed(1) + '&nbsp;&nbsp;' + p._data[2].toFixed(1) + '';
                        txt += "<br>pos vx  : " + currentVoxel._data[0].toFixed(0) + '&nbsp;&nbsp;' + currentVoxel._data[1].toFixed(0) + '&nbsp;&nbsp;' + currentVoxel._data[2].toFixed(0) + '';

                        txt += "<br> value: <b>" + value + "</b>";

                    }
                    $infobar.html(txt);

                }
                if ($infobar.hidden)
                    $infobar.hide();
                else
                    $infobar.show();
            }
            else
                $infobar.hide();
        }


        signalhandler.attach("updateInfoBar", updateInfoBar);


        signalhandler.attach("climChange", function(event)
        {
            if (event.id == that.currentFileID)
                setColorMapLims(event.val);
        });


        
        function resetColorMapLims(lims)
        {
            if(lims == undefined)
                lims = ['auto', 'auto'];
            
            var mmin, mmax;

            var nii = that.nii;

            if (nii.isMask)
            {
                mmin = 0;
                mmax = 1;
                histoManager.clim = [0, 1];
            }
            else
            {
                if( lims[0]=='auto' )
                    mmin = nii.histogram.min + 0.05 * (nii.histogram.max - nii.histogram.min);
                else
                    mmin = parseInt( nii.datascaling.ie( lims[0]) );
                
                if( lims[1]=='auto' )
                    mmax = nii.histogram.max - 0.1 * (nii.histogram.max - nii.histogram.min);
                else
                    mmax = parseInt( nii.datascaling.ie( lims[1]) );


            }
            
            histoManager.clim = [mmin, mmax];
                                    
            //setColorMapLims(clim);
            signalhandler.send("climChange", {
                id: that.currentFileID,
                val: histoManager.clim
            });

        }
        that.resetColorMapLims = resetColorMapLims;

        function setColorMapLims(clim_in)
        {
            histoManager.saveSettings()
            if (clim_in != undefined)
                histoManager.clim = clim_in.slice(0);
            histoManager.updateHistogramClim();
            drawSlice({
                noquiver: true,
                mosaicdraw: true,
                lazy:!that.viewport.hasMouse
            });

        }

        function createTrace(obj)
        {
              var p = obj.getPoints();
              if (p.length < 2)
                return;

                
              var flines = "";
              var quant = 10;
              var col = [255,0,0];
              var col2 = [0,255,0];
              var op = 0.5;


              if (obj.color != undefined)
              {                  
                  if (obj.color.length == 3)
                    col = obj.color;
                  else
                    col = KColor.list[obj.color]
              }


              function addline(col,op,x0,y0,x1,y1)
              {
			       flines += '<line style="stroke-width:3px;stroke:rgba('+col[0]+','+col[1]+','+col[2]+','+op+')" x1="' +x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 + '" />';
              }


             var offs = 0;
             if (obj.type == "electrode" && obj.electrode_properties && obj.electrode_properties.deformed)
                offs = 1;
             var range = Array.from({length: p.length-offs-1}, (x, i) => i+offs+1);
             var range_last = Array.from({length: p.length-offs-1}, (x, i) => (i+offs+p.length)%p.length);;
             if (obj.type == "2diameter")
             {
                  if (p.length == 4)
                  {
                      range = [0,2];
                      range_last = [1,3]
                  }
             }



             var cur = getCanvasCoordinates(getWorldPosition());
             var cur_z = cur.z_mm;


             for (var j = 0; j < range.length;j++)
             {
                 var k = range[j];
                 var c,last;
                 if (KViewer.navigationMode == 0)
                 {
                    c = that.getCanvasCoordinates(math.multiply(KViewer.reorientationMatrix.matrix,p[k%p.length].p.coords)._data);
                    last  = that.getCanvasCoordinates(math.multiply(KViewer.reorientationMatrix.matrix,p[range_last[j]].p.coords)._data);
                 }
                 else
                 {
                    c = that.getCanvasCoordinates(p[k%p.length].p.coords);
                    last  = that.getCanvasCoordinates(p[range_last[j]].p.coords);

                 }       


                 if (Math.abs(c.z_mm - cur_z)<1 && Math.abs(last.z_mm - cur_z)<1) // (last.z_mm > cur_z && c.z_mm < cur_z) | (last.z_mm < cur_z && c.z_mm > cur_z))
                 {    
                  
                     var x0 = last.x_pix ;
                     var y0 = last.y_pix;;
                     var x1 = c.x_pix;
                     var y1 = c.y_pix;
                    addline(col,1,x0,y0,x1,y1)
                 }
                 else
                 {

                     var dx = (c.x_pix - last.x_pix)/c.x_pixPerMM ;
                     var dy = (c.y_pix - last.y_pix)/c.y_pixPerMM ;
                     var dz = c.z_mm-last.z_mm
                     var n = (1-Math.abs(dz)/Math.sqrt(dx*dx+dy*dy+dz*dz))*0.5;


                     var x0 = last.x_pix ;
                     var y0 = last.y_pix;
                     var x1 = c.x_pix;
                     var y1 = c.y_pix;
                     var lam =  (cur_z-c.z_mm)/(last.z_mm-c.z_mm);

                     var lam1 = lam+n;
                     var lam2 = lam-n
                     if (lam1 > 1) lam1 = 1;
                     if (lam1 < 0) lam1 = 0;
                     if (lam2 < 0) lam2 = 0;
                     if (lam2 > 1) lam2 = 1;
 
                     var xm1 =  last.x_pix*lam1 + c.x_pix*(1-lam1);
                     var ym1 =  last.y_pix*lam1 + c.y_pix*(1-lam1);
                     var xm2 =  last.x_pix*lam2 + c.x_pix*(1-lam2);
                     var ym2 =  last.y_pix*lam2 + c.y_pix*(1-lam2);
      				 if(!isNaN(xm1))
      				 {
						 addline(col,op,x0,y0,xm2,ym2);
						 addline(col,op,xm1,ym1,x1,y1);
						 addline(col,1,xm1,ym1,xm2,ym2);
      				 }                  

                 }
              
                 last = c;
             }


             var bezier = ""
             if (obj.type == "2diameter")
             {
                  if (p.length == 4)
                  {
                        var c = []
                        c[0] = that.getCanvasCoordinates(p[0].p.coords);
                        c[1] = that.getCanvasCoordinates(p[2].p.coords);
                        c[2] = that.getCanvasCoordinates(p[1].p.coords);
                        c[3] = that.getCanvasCoordinates(p[3].p.coords);
                        var f = 0.27;
                        bezier =  " M " + c[0].x_pix + " " + c[0].y_pix;
                        for (var k = 0; k < 4;k++)
                        {
                            var i0 = k;
                            var i1 = (k+1)%4;
                            var i2 = (k+2)%4;
                            var i3 = (k+3)%4;
                            bezier += " C " +
                                (c[i0].x_pix + (c[i1].x_pix-c[i3].x_pix)*f) + " " + (c[i0].y_pix + (c[i1].y_pix-c[i3].y_pix)*f) + " " +
                                (c[i1].x_pix - (c[i2].x_pix-c[i0].x_pix)*f) + " " + (c[i1].y_pix - (c[i2].y_pix-c[i0].y_pix)*f) + " " +
                                 c[i1].x_pix + " " + c[i1].y_pix ;
                        }
                        bezier = '<path style="stroke-width:3px;stroke:rgba('+col[0]+','+col[1]+','+col[2]+','+op+')"  d="'+bezier+'" stroke="black" fill="transparent"/>'


                  }
             }


             var w = that.$canvascontainer.width();
             var h = that.$canvascontainer.height();
             var $lines = $("<svg  style='pointer-events:none;width:"+w+"px;height:"+h+"px;z-index:5;position:absolute;'>" + flines + bezier + "</svg>");
	  
             if (obj.type == "2diameter")
             {
                 try {
                 var l = $lines.find("path")[0].getTotalLength()/c[0].x_pixPerMM;
                 obj.circumference = l;
                 } catch(err) {}
             }

             that.$canvascontainer.append($lines);


             return $lines
        }
        that.createTrace = createTrace;



        function updateSubsamplingFactor(highres,params)
        {

            var quality = 4;
            if (state.viewer.viewing_quality2D != undefined)
                quality = state.viewer.viewing_quality2D

            if (state.viewer.viewing_quality2D_roi != undefined)
                if (that.currentROI != undefined && params != undefined && params.roidraw)
                    quality = state.viewer.viewing_quality2D_roi

            
            var sx_,sy_;
            if (slicingDimOfArray == 0)
            {
                sx_ = that.nii.sizes[1];
                sy_ = that.nii.sizes[2];
            }
            if (slicingDimOfArray == 1)
            {
                sx_ = that.nii.sizes[0];
                sy_ = that.nii.sizes[2];
            }
            if (slicingDimOfArray == 2)
            {
                sx_ = that.nii.sizes[0];
                sy_ = that.nii.sizes[1];
            }



            var matx = Math.round(that.$canvascontainer.width()*quality/4);
            var maty = Math.round(that.$canvascontainer.height()*quality/4);

            if (matx < 256) matx = 256;
            if (maty < 256) maty = 256;
            
            var rx = Math.max(sx_/matx+0.5 ,1);
            var ry = Math.max(sy_/maty+0.5 ,1);
            //rx = Math.floor(rx);
            //ry = Math.floor(ry);
            rx = Math.round((rx-1)/2)*2+1;
            ry = Math.round((ry-1)/2)*2+1;
            if (rx == Infinity)
                rx = 1;
            if (ry == Infinity)
                ry = 1;

            if (highres)
            {
                rx=1;
                ry=1;
            }

            var ret = false;
            if (that.subsample_factor_x != rx)
                ret = true;
            if (that.subsample_factor_y != ry)
                ret = true;
            that.subsample_factor_x = rx;
            that.subsample_factor_y = ry;

            //console.log(that.subsample_factor_x + " , " + that.subsample_factor_y);

            return ret;
        }


        function drawSlice(params)
        {
            if (that.nii == undefined)
                return;
/*           
            // do not draw on hidden viewports during zoom
            if (master.zoomedViewport != -1 && master.zoomedViewport != that.viewport.viewPortID)
                return;
 
            if (params && params.nosliceupdate != undefined && params.nosliceupdate == true)
                return
*/
            if (params && params.point)
                customPoint = params.point;


            if (that.nii.type != undefined)
                if (that.nii.type !== 'nii')
                {
                    $infobar.html(("<div style='position:absolute; width:600px; left:100px;top:100px; font-size:20px;'>Sorry, this Nifti Type is not yet fully supported: <br />" + that.nii.type + "</div>"));
                    return;
                }

            var sliceChanged = setCurrentVoxel();
            var respectSlCh = (params != undefined && params.respectSliceChange);

            if (that.slice_out_of_range)
            {
                that.$canvas.css('opacity',0.3)
                return;
            }
            else 
                that.$canvas.css('opacity',1)

            if (params && params.preferred == false)
                params.lazy = true;

            mip_slab = 0;
            avg_slab = 0; 
            if (that.histoManager.slab_projection_type == 'mip')
                mip_slab = that.histoManager.slab;
            if (that.histoManager.slab_projection_type == 'avg')
                avg_slab = that.histoManager.slab;

   

            function eagerDraw3D(arr,fun,done)
            {
                for (var k = 0; k < arr.length; k++)
                        fun(k);
                done();                
            }


            function lazyDraw3D(arr,fun,done)
            {
                for (var k = 0; k < arr.length; k++)
                {
                    if (arr[k].cid != undefined)
                        clearTimeout(arr[k].cid);

                    arr[k].cid = setTimeout(function(k) { return function() { 
                            fun(k); 
                            clearTimeout(arr[k].cid);
                            arr[k].cid = undefined;
                            
                            for (var j = 0;j < arr.length;j++)
                                if (arr[j].cid != undefined)
                                    return;

                            if (that.nii != undefined)
                                done();

                     }}(k),0
                     );
 

                }
            }


            function eagerDraw2D(fun)
            {
                fun()
            }

            function lazyDraw2D(fun)
            {
                  var t = 0;
                  var to = 150;
                  if (state.viewer.viewing_timeout)
                     to = state.viewer.viewing_timeout;
                  if ((params && !params.preferred) | params == undefined)
                     t = to
                  if (that.cid != undefined)
                        clearTimeout(that.cid);
                  that.cid = setTimeout(function() {
                        if (that.nii != undefined)
                            fun(params);
                        clearTimeout(that.cid);
                        that.cid = undefined;
                    },t);
            }
            
            if(master.static.lazydraw_timeout == 0 || 
               typeof eagerDrawActive != "undefined" ||
                (master.movie.isPlayed) ||
                (params && params.eagerDrawActive))
            {
                var draw3D = eagerDraw3D;
                var draw2D = eagerDraw2D;
            }
            else
            {
                var draw3D = lazyDraw3D;
                var draw2D = lazyDraw2D;
            }


            if (params && params.lazy == false)
            {
                draw2D = eagerDraw2D; 
            }
            
            if (gl_enabled)
            {
                var ctx3d = gl.getCtx();
                var textures3d = gl.getTextures();
                draw3D(textures3d,function(k) {
                        if (that.nii == undefined)
                            return;

                        applySlicingDimOfWorld(k);
                        textures3d[k].uOffset = 0;
                        textures3d[k].vOffset = 1 - csy / gl.texSize;
                        textures3d[k].uScale = csx / gl.texSize;
                        textures3d[k].vScale = csy / gl.texSize;

                        currentSlice = math.round(currentVoxel._data[slicingDimOfArray]);

                        if (master.mainViewport !== -1)
                        {
                            sliceData = ctx3d[k].createImageData(csx, csy);
                            drawSlice_interpolate();
                            ctx3d[k].putImageData(sliceData, 0, 0);
                        }
                        else
                        {
                            if (!respectSlCh || textures3d[k].currentSlice != currentSlice)
                            {
                                sliceData = ctx3d[k].createImageData(csx, csy);
                                if (!that.nii.dummy)
                                    drawSlice_normal();
                                else
                                {
                                    sliceData.data.fill(128+30*k);
                                }
                                ctx3d[k].putImageData(sliceData, 0, 0);
                                textures3d[k].currentSlice = currentSlice;
                            }

                        }

                },
                function()
                {
                    gl.updatePlanes();
                    gl.updateTexture();

                });

/*
                var vr = gl.volrender;
                for (var k = 0; k < vr.planes.length; k++)
                {
                    if (vr.planes[k] != undefined)
                    {
                        applySlicingDimOfWorld(vr.planes[k].sliceing);

                        vr.textures[k].uOffset = 0;
                        vr.textures[k].vOffset = 1 - csy / gl.texSize;
                        vr.textures[k].uScale = csx / gl.texSize;
                        vr.textures[k].vScale = csy / gl.texSize;
                        sliceData = vr.ctx[k].createImageData(csx, csy);
                        drawSlice_normal(math.round(vr.planes[k].arr_slicepos));
                        vr.ctx[k].putImageData(sliceData, 0, 0);
                    }
                }
                gl.updateVolume();
                */

            }
            else
            {

                var sliceDrawer = drawSlice_normal;
                if (master.mainViewport !== -1)
                    sliceDrawer = drawSlice_interpolate;

                if (that.mosaicview.active)
                {
                    if ((params && params.mosaicdraw) || that.atlas.length > 0)
                        that.mosaicview.draw(sliceDrawer);


                    renderOutlines("close")

                }
                else
                {


                    if (!respectSlCh || sliceChanged)
                    {
                     
                        draw2D(function(params)
                        {

                            if (updateSubsamplingFactor(undefined,params))
                            {
                                applySlicingDimOfWorld(slicingDimOfWorld)
                                setCanvasLayout()
                            }

                            sliceData = ctx.createImageData(csx, csy);
                            var clip;
                            if (that.largeContent())
                                clip = getClipBox();

                            var tmp = currentSlice;
                            var slab = Math.max(mip_slab,avg_slab)
                            for (var i = -slab; i <= slab;i++)
                            {
                                currentSlice = tmp+1*i;
                                sliceDrawer(undefined,clip);
                            }
                            currentSlice = tmp;
                            
                            ctx.putImageData(sliceData, 0, 0);

                            renderOutlines("update",params)
      

                        });

                        



                    }
                }
            }

           // setCurrentVoxel();
            drawHairCross();
            updateInfoBar();

            if (params && params.noquiver)
                ;
            else if (!respectSlCh || sliceChanged)
                quiver.draw();

        }

        function getClipBox()
        {

                var canvas_offs = that.$canvas.offset();
                var contai_offs = that.$container.offset();
                var canvas_wid = that.$canvas.width();
                var canvas_hei = that.$canvas.height() ;
                var contai_wid = that.$container.width();
                var contai_hei = that.$container.height();
                var clip = [0,0,1,1];

                var dw =  (canvas_offs.left-contai_offs.left );
                if (dw < 0)
                    clip[0] = -dw / that.$canvas.width() ;
                dw = canvas_wid-contai_wid + dw;
                if (dw> 0)
                   clip[2] = 1-dw/canvas_wid;

                var dh =  (canvas_offs.top-contai_offs.top );
                if (dh < 0)
                    clip[1] = -dh / that.$canvas.height() ;
                dh = canvas_hei-contai_hei + dh
                if (dh> 0)
                   clip[3] = 1-dh/canvas_hei;

                return clip;
        }
        that.getClipBox = getClipBox;




        function renderOutlines(type,params)
        {
                if (params != undefined && params.frommove) // during roi-painting => do not update outlins
                    return;
/*
                for (var k = 0; k < that.atlas.length;k++)
                {
                    if (that.atlas[k].outlines != undefined)
                    {
                            that.atlas[k].outlines[type](that);
                    }

                }
  */              
                if (that.outlines != undefined)
                    that.outlines[type]();

                for (var k = 0; k < that.overlays.length;k++)
                    if (that.overlays[k].outlines != undefined)
                        that.overlays[k].outlines[type](that);

                for (var k = 0; k < that.objects3D.length;k++)
                    if (that.objects3D[k].contour != undefined)
                    {
                        if (that.objects3D[k].outlines == undefined)
                            that.objects3D[k].outlines = Outlines(that.objects3D[k])
                        that.objects3D[k].outlines[type](that);
                    }

                
                for (var k = 0; k < that.ROIs.length;k++)
                    if (that.ROIs[k].outlines != undefined && that.ROIs[k].visible)
                        that.ROIs[k].outlines[type](that);
                    else if (!that.ROIs[k].visible && that.ROIs[k].outlines != undefined)
                        that.ROIs[k].outlines['close'](that);
        }


        that.renderOutlines = renderOutlines;


        var quiver = FiberQuiver(that);
        that.quiver = quiver;


        that.drawSlice = drawSlice;
        that.positionChanger = signalhandler.attach("positionChange", drawSlice);
        signalhandler.attach("drawSlices", drawSlice);


        signalhandler.attach("clearMultiOutlines", function(){
            for (var k = 0; k < that.atlas.length;k++)
                that.atlas[k].clearMultiOutlines()
        });


        ///////////////////////// painting ///////////////////////////////////////////////
        ///////////////////////// painting ///////////////////////////////////////////////


        var niiOriginal;
        function resliceOnMaster()
        {
            if (that.nii == undefined)
                return;

            // reset everything to normal first
            that.nii = niiOriginal;

            if (master.mainViewport !== -1)
            {
                var niin = master.viewports[master.mainViewport].medViewer.niiOriginal;
                if (niin == undefined)
                {
                    master.toggleMainViewport(-1);
                    //master.mainViewport = -1;
                    return;
                }

                var sizes = [niin.sizes[0], niin.sizes[1],niin.sizes[2], niiOriginal.sizes[3]];
                var voxsz = niin.voxSize;
                var edges = niin.edges;

                if (sizes[2] == 1 && that.viewport.viewPortID != master.mainViewport)
                {
                  var p0 = math.multiply(that.nii.edges,[0,0,0,1])._data;
                  var p1 = math.multiply(that.nii.edges,[that.nii.sizes[0],that.nii.sizes[1],that.nii.sizes[2],1])._data;
                  var n = [edges._data[0][2],edges._data[1][2],edges._data[2][2]];
                  var d = math.floor(math.abs(((p0[0]-p1[0]) * n[0] + (p0[1]-p1[1]) * n[1] + (p0[2]-p1[2]) * n[2]) / math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2])));
                  var vsz = voxsz[2];
                  edges = math.multiply(edges, [ [1,0,0,0], [0,1,0,0], [0,0,vsz,-d/2],[0,0,0,1] ]);
                  sizes[2] = (d/vsz);
                  voxsz[2] = vsz;

                 //   sizes[2] = that.nii.sizes
                }





                var centerVoxel = math.matrix([Math.floor(sizes[0] / 2),Math.floor(sizes[1] / 2),Math.floor(sizes[2] / 2),  1]);
                var centerWorld = math.multiply(edges, centerVoxel);

                that.nii = {
                    edges: edges,
                    voxSize: voxsz,
                    sizes: sizes,
                    edges_noscale: math.multiply(edges,math.diag([1/voxsz[0],1/voxsz[1],1/voxsz[2],1])),

                    //  newsizes,
                    permutationOrder: niin.permutationOrder,
                    arrayReadDirection: niin.arrayReadDirection,
                    detsign: niin.detsign,
                    histogram: niiOriginal.histogram,
                    currentTimePoint: niiOriginal.currentTimePoint,
                    numTimePoints: niiOriginal.numTimePoints,

                    centerVoxel:centerVoxel,
                    centerWorld:centerWorld,

                    widheidep: niin.widheidep,
                    widhei: niin.widhei,
                    wid: niin.wid,

                    datascaling: niiOriginal.datascaling,
                    type: 'nii'
                }

            }


            if (gl_enabled)
                gl.updateObjects();

            setSlicingDimOfWorld(slicingDimOfWorld);
            setCurrentVoxel();
            signalhandler.send('clearMultiOutlines')
            //drawSlice();
        }

        signalhandler.attach("reslice", resliceOnMaster);


        ////////////////////////////////////

        function drawSlice_interpolate(curSl,clipratio)
        {

            if (clipratio == undefined)
                clipratio = 0;
            if (state.viewer.background_color)
            {
                background_color2D = new KColor(state.viewer.background_color).color
                that.$container.css('background',state.viewer.background_color);
            }

            //  console.log('in drawSlice_interpolate');

           // currentSlice = currentVoxel._data[slicingDimOfArray];

            if (curSl != undefined)
            {
                currentSlice = curSl;                
            }

            var totsize = niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2];

            var tOffset = 0;
            if (that.nii.currentTimePoint)
                   tOffset = that.nii.currentTimePoint.t * totsize;
            var tOffset_ovl = 0;

            var R;
            if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                R = math.diag([1, 1, 1, 1]);
            else
                R = getTiltMat(slicingDimOfArray);


          // prep the overlays
            prepOverlays(true);

            var colVol = false;
            var numCol = 0;
            that.colVol_reorient = undefined;
            if (niiOriginal.sizes[3]%3 == 0)
            {
                numCol = niiOriginal.sizes[3]/3
                colVol = that.showcolored;

                var n = that.nii;
                var Order = KMedViewer.getPermutationOrder(); 
              
                if (that.showcolored_type == "raw")
                    that.colVol_reorient = math.diag([1,1,1,1])._data;
                else
                {
                    var e2 = (math.multiply(n.edges,math.diag([1/n.voxSize[0],1/n.voxSize[1],1/n.voxSize[2],1])));
                    e2 =  (math.multiply(math.inv(KViewer.reorientationMatrix.matrix),e2));


                    e2 = colorPermutation(e2,that,niiOriginal);

                    that.colVol_reorient = e2._data;
                }

            }
         //   else
           //     that.colVol_reorient = colorPermutation(math.diag([1,1,1,1]),that);



            // prep the rois
            while (that.ROIs_temp.length > 0) {
                that.ROIs_temp.pop();       }
            prepROIs();


            // prep the atlass
            for (var k = 0; k < that.atlas.length; k++)
                that.atlas[k].updateGetPixelFunction(that.nii, R);

            var plotAtlas = that.atlas.length > 0;

            // the(!) coordinate mapping
            var reorient = math.diag([1, 1, 1, 1]);
            var mapCoords = undefined
            var R_isIdentity = true;
            


            if (KViewer.navigationTool.isinstance && 
                (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ) )
            {
                if (KViewer.reorientationMatrix.deffield)
                {
                      var def = KViewer.reorientationMatrix.deffield;
                      var def_edges_inv = math.inv(KViewer.reorientationMatrix.deffield.edges);
                      R = math.inv(niiOriginal.edges)._data
                      reorient = KViewer.reorientationMatrix.matrix;
                    
                      var Adef = math.multiply(math.multiply(def_edges_inv, reorient), that.nii.edges)._data;

                      mapCoords = function (x,y,z)
                      {
                           return [trilinInterp(def,x,y,z,Adef,def.widheidep*0),
                                   trilinInterp(def,x,y,z,Adef,def.widheidep*1),
                                   trilinInterp(def,x,y,z,Adef,def.widheidep*2)]
                      }

                      R_isIdentity = false;
                }
                else
                {
                    reorient = KViewer.reorientationMatrix.matrix;
                    R = math.multiply((math.multiply(math.inv(niiOriginal.edges), math.multiply(reorient, that.nii.edges))), R)._data;
                    R_isIdentity = isIdentity(R);
                }
            }
            else
            {
                R = math.multiply((math.multiply(math.inv(niiOriginal.edges), math.multiply(reorient, that.nii.edges))), R)._data;
                R_isIdentity = isIdentity(R);
            }
            function renderVal(k, px, py, pz)
            {
                var px_ = px;
                var py_ = py;
                var pz_ = pz;
                var cval = -9999999999;
                if (that.visible)
                {
                    if (R_isIdentity)
                    {
                        var ind = niiOriginal.widhei * Math.round(pz) + Math.round(py) * niiOriginal.wid + Math.round(px);
                        cval = niiOriginal.data[ind + tOffset];
                    }
                    else
                    {
                         if(mapCoords != undefined)
                         {
                            var ps = mapCoords(px,py,pz)
                            px = ps[0];
                            py = ps[1];
                            pz = ps[2];
                         }
                         cval = trilinInterp(niiOriginal, px, py, pz, R, tOffset);
                    }
                }

                if (cval == undefined)
                   cval = -9999999999;

                if (cval != undefined)
                {

                   for (var j = 0; j < that.overlays.length; j++)
                        if (that.overlays[j].getPixel)
                           that.overlays[j].val = that.overlays[j].getPixel(px_,py_,pz_);

                    if (colVol)
                    {

                        var e =  that.colVol_reorient ;
                        var c = [0,0,0]
                        var n = 1; //numCol
                        for (var s = 0;s < n;s++)
                        {
                            var cVal = trilinInterp3_signcorrected(niiOriginal, px, py, pz, R,totsize,s*totsize*3); 
                            if (cVal == undefined)
                                break;
                            
                            if (e)
                            {
                                c[0] +=  math.abs( e[0][0]*cVal[0] + e[0][1]*cVal[1] + e[0][2]*cVal[2]) 
                                c[1] +=  math.abs( e[1][0]*cVal[0] + e[1][1]*cVal[1] + e[1][2]*cVal[2]) 
                                c[2] +=  math.abs( e[2][0]*cVal[0] + e[2][1]*cVal[1] + e[2][2]*cVal[2])
                            }
                            else
                            {
                                c[0] += math.abs(cVal[0]);
                                c[1] += math.abs(cVal[1]);
                                c[2] += math.abs(cVal[2]);
                            }

                        }
                        mapRGBval([c[0]/n,c[1]/n,c[2]/n],  k, rgbmapper,that.overlays.length,putVoxel);

                    }
                    else if (niiOriginal.datatype == 'rgb24')
                    {
                           cval = trilinInterp_rgbnii(niiOriginal, px, py, pz, R, tOffset);
                           if (cval != undefined)
                            mapRGBval( cval, k, rgbmapper, that.overlays.length,putVoxel);
                    }
                    else
                    {
                        mapRGBval(cval, k, colmapper, that.overlays.length,putVoxel);
                    }

                }
                if (that.ROIs_temp.finalLength > 0 |  plotAtlas) 
                    putRoiPixel(px_, py_, pz_, k,undefined,putVoxel);

            }

            if (slicingDimOfArray == 0)
            {
                var sx_ =  that.nii.sizes[1];
                var sy_ =  that.nii.sizes[2]; 
                var renderVal_ = function(k,a,b) { return renderVal(k,currentSlice,a,b); }
            }
            if (slicingDimOfArray == 1)
            {
                var sx_ =  that.nii.sizes[0];
                var sy_ =  that.nii.sizes[2]; 
                var renderVal_ = function(k,a,b) { return renderVal(k,a,currentSlice,b); }
            }
            if (slicingDimOfArray == 2)
            {
                var sx_ =  that.nii.sizes[0];
                var sy_ =  that.nii.sizes[1]; 
                var renderVal_ = function(k,a,b) { return renderVal(k,a,b,currentSlice); }
            }

            var cr = clipratio
            if (swapXY)
            {
                cr = [clipratio[1],clipratio[0],clipratio[3],clipratio[2]];
                mapValtoRGBVol.sx_ = sy_ // for dither
            }
            else
                mapValtoRGBVol.sx_ = sx_


            if (clipratio.length == 4)
            {
                if (xflip != 0)
                {
                    var startx = Math.floor(sx_ * (1-cr[2]));
                    var endx = Math.floor(sx_ * (1-cr[0]));
                }
                else
                {
                    var startx = Math.floor(sx_ * cr[0]);
                    var endx = Math.floor(sx_ * cr[2]);
                }

                if (yflip != 0)
                {
                    var starty = Math.floor(sy_* (1-cr[3]));
                    var endy = Math.floor(sy_ * (1-cr[1]));
                }
                else
                {
                    var starty = Math.floor(sy_* (cr[1]));
                    var endy = Math.floor(sy_ * (cr[3]));
                }
        
                if (clipratio.mosaic)  
                {
                    var sxclipped = Math.floor(sx*Math.abs(cr[2]-cr[0]));
                    var syclipped = Math.floor(sy*Math.abs(cr[3]-cr[1]));
                    var sx_clipped = Math.floor(sx_*Math.abs(cr[2]-cr[0]));
                    var sy_clipped = Math.floor(sy_*Math.abs(cr[3]-cr[1]));
                    var offsx = startx;
                    var offsy = starty;                        
                }
                else 
                {    
                    var sxclipped = Math.floor(sx);
                    var syclipped = Math.floor(sy); 
                    var sx_clipped = Math.floor(sx_);
                    var sy_clipped = Math.floor(sy_);
                    var offsx = 0;
                    var offsy = 0;
                }
            
/*
                var sxclipped = Math.floor(sx);// *  (clipratio[2]-clipratio[0]));
                var syclipped = sy; //Math.floor(sy *  (clipratio[2]-clipratio[0]));
                var sx_clipped = Math.floor(sx_);//* (clipratio[2]-clipratio[0]));
                var sy_clipped = sy_ //Math.floor(sy_* (clipratio[2]-clipratio[0]));
                var offsx = 0;
                var offsy = 0;
*/
            }
            else
            {


                var startx = Math.floor(sx_ * clipratio / 2);
                var starty = Math.floor(sy_ * clipratio / 2);
                 var offsx = startx;
                var offsy = starty;
                var endx = sx_ - Math.floor(sx_ * clipratio / 2);
                var endy = sy_ - Math.floor(sy_ * clipratio / 2);

                var sxclipped = Math.floor(sx * (1 - clipratio))
                var syclipped = Math.floor(sy * (1 - clipratio))
                var sx_clipped = Math.floor(sx_ * (1 - clipratio))
                var sy_clipped = Math.floor(sy_ * (1 - clipratio))
            }

            var delta_x = that.subsample_factor_x;
            var delta_y = that.subsample_factor_y;

            var half_x = Math.floor(delta_x*0.5);
            var half_y = Math.floor(delta_y*0.5);

            startx = Math.floor(startx/delta_x)*delta_x;
            starty = Math.floor(starty/delta_y)*delta_y;


            var k;
            for (var x = startx; x < endx; x+=delta_x)
                for (var y = starty; y <endy; y+=delta_y)
                {                   
                    if (swapXY)
                        k = ((sxclipped * xflip + xdir * Math.round((x - offsx)/delta_x) - xflip) * syclipped + yflip * syclipped + ydir * Math.round((y - offsy)/delta_y) - yflip) * 4;
                    else
                        k = ((syclipped * yflip + ydir * Math.round((y - offsy)/delta_y) - yflip) * sxclipped + xflip * sxclipped + xdir * Math.round((x - offsx)/delta_x) - xflip) * 4;

                   renderVal_(k, x,y);

                }

        }







        function getTiltMat(slicing,nii)
        {
            if (nii == undefined)
                nii = that.nii;

            var sg = [];

            var M = (permutationMat(nii))._data;
            var perm = that.nii.permutationOrder;
            var minors = function(a,b)
            {
                return [(a[1]*b[2] - a[2]*b[1]) ,
                        (a[0]*b[2] - a[2]*b[0]) ,
                        (a[0]*b[1] - a[1]*b[0])  ];
            }        
            var sg=[ minors(M[1],M[2])[perm[0]],
                     minors(M[0],M[2])[perm[1]],
                     minors(M[0],M[1])[perm[2]] ];

            var R;
            if (slicing == 0)
                R = tiltMat(-sg[2] * master.currentTilts(2, 0).v, -sg[1] * master.currentTilts(1, 0).v, 0);
            else if (slicing == 1)
                R = tiltMat(sg[2] * master.currentTilts(2, 1).v, -sg[0] * master.currentTilts(0, 0).v, 1);
            else
                R = tiltMat(sg[0] * master.currentTilts(0, 1).v, sg[1] * master.currentTilts(1, 1).v, 2);
               

            return R;
        }
        that.getTiltMat = getTiltMat;
 
        that.getSlicingTiltMat = function(nii)
        {
            return getTiltMat(slicingDimOfArray,nii);
        }


        function tiltMat(t1, t2, slicing)
        {
            var six = Math.sin(t1 / 180 * Math.PI);
            var siy = Math.sin(t2 / 180 * Math.PI);
            var sin2t = siy * siy + six * six + myeps;
            var cost = Math.sqrt(1 - sin2t);
            var a = (1 - cost) / sin2t;
            var rotmat = math.matrix(
            [[cost, six, siy, 0],
            [-six, cost + a * siy * siy, -a * six * siy, 0],
            [-siy, -a * six * siy, cost + a * six * six, 0],
            [0, 0, 0, 1]]);
            var Q;
            if (slicing == 0)
                Q = math.matrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
            else if (slicing == 1)
                Q = math.matrix([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
            else
                Q = math.matrix([[0, 0, 1, 0], [0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 1]]);

            var Trinv = math.multiply(Q, math.matrix([[that.nii.voxSize[0], 0, 0, -(currentVoxel._data[0]) * that.nii.voxSize[0]],
            [0, that.nii.voxSize[1], 0, -(currentVoxel._data[1]) * that.nii.voxSize[1]],
            [0, 0, that.nii.voxSize[2], -(currentVoxel._data[2]) * that.nii.voxSize[2]],
            [0, 0, 0, 1]]));
            var Tr = math.inv(Trinv);
            A = math.multiply(Tr, math.multiply(rotmat, Trinv))._data;
            return A;
        }


        var rgbmapper = function(cVal)
        {
            if (!isNaN(cVal[0]))
            {
                var rgba = histoManager.mapVal(cVal);
                if (rgba[0] > 0 | rgba[1] > 0 | rgba[2] > 0)
                    rgba[3] = 255;
                else
                    rgba[3] = 0;
                return rgba;
            }
            else
                return [0, 0, 0, 0];
        }

        var geo_rgbmapper = function(cVal)
        {
            if (!isNaN(cVal[0]))
            {
                var e =  that.colVol_reorient ;
                if (e)
                    cVal = [ math.abs( e[0][0]*cVal[0] + e[0][1]*cVal[1] + e[0][2]*cVal[2]) ,
                             math.abs( e[1][0]*cVal[0] + e[1][1]*cVal[1] + e[1][2]*cVal[2]) ,
                             math.abs( e[2][0]*cVal[0] + e[2][1]*cVal[1] + e[2][2]*cVal[2]) ];
                else
                    cVal = [ math.abs(cVal[0]),math.abs(cVal[1]),math.abs(cVal[2]) ];

                var rgba = histoManager.mapVal(cVal);
                if (rgba[0] > 0 | rgba[1] > 0 | rgba[2] > 0)
                    rgba[3] = 255;
                else
                    rgba[3] = 0;
                return rgba;
            }
            else
                return [0, 0, 0, 0];
        }



        var colmapper = function(cVal)
        {
            if (!isNaN(cVal))
            {
                var currentVal = histoManager.mapVal(cVal);
                if (currentVal < 0)
                    return [background_color2D[0],
                            background_color2D[1],
                            background_color2D[2],
                            0]
                return colormap.mapVal(currentVal, histoManager.cmapindex);
            }
            else
                return [background_color2D[0],
                        background_color2D[1],
                        background_color2D[2],
                        0]
        }




        function mapRGBval(cVal, ktoplot, mapper, ovl_num,putVoxel)
        {
                var rgba = mapValtoRGBVol(cVal, mapper, ovl_num,ktoplot);
                if (avg_slab > 0)              
                    putVoxel(ktoplot,rgba,(x,y) => y+x/(2*avg_slab+1));
                else if (mip_slab > 0)              
                    putVoxel(ktoplot,rgba,Math.max);
                else
                    putVoxel(ktoplot,rgba);

        }

        function putVoxel(k,rgba,f)
        {
             if (f == undefined)
             {
                sliceData.data[k + 0] = rgba[0];
                sliceData.data[k + 1] = rgba[1];
                sliceData.data[k + 2] = rgba[2];
                sliceData.data[k + 3] = rgba[3];
             }
             else
             {
                sliceData.data[k + 0] = f(rgba[0],sliceData.data[k + 0]);
                sliceData.data[k + 1] = f(rgba[1],sliceData.data[k + 1]);
                sliceData.data[k + 2] = f(rgba[2],sliceData.data[k + 2]);
                sliceData.data[k + 3] = f(rgba[3],sliceData.data[k + 3]);

             }          
        }

        function mapValtoRGBVol(cVal, mapper, ovl_num,k)
        {
            var currentVal = 0;
            var rgba;
            rgba = mapper(cVal, rgba);

            if (ovl_num > 0)
            {
                var rgba_ovl = [0, 0, 0, 0];
                var vis = false;
                for (var j = 0; j < ovl_num; j++)
                {
                    var ovl = that.overlays[j];
                    if (ovl.visible)
                    {
                        var v = ovl.val;
                        if (ovl.dither)
                        {
                            var a = math.round(ovl.dither*((k/4)%mapValtoRGBVol.sx_))
                            var b = math.round(ovl.dither*(k/4/mapValtoRGBVol.sx_))
                            if ((a%2==0 & b%2==1)|(a%2==1 & b%2==0))
                                continue;
                        }


                        if (v[0] > 0 )
                        {
                            for (var i = 0; i < 4; i++)
                                rgba_ovl[i] += v[i+1];
                            vis =true;
                        }
                    }
                }                
                if (vis)
                {

                    if (ovl.histoManager.blending)
                    {
                        var fad = (rgba_ovl[0]+rgba_ovl[1]+rgba_ovl[2])/3/255;
                        if (fad > 1) fad = 1;
                        fad = Math.sqrt(fad)*that.transfactor;
                        for (var i = 0; i < 4; i++)
                            rgba[i] = rgba[i]*(1-fad) +that.transfactor*rgba_ovl[i];
                    }
                    else
                    {
                        if (rgba_ovl[0]+rgba_ovl[1]+rgba_ovl[2] > 0)
                            for (var i = 0; i < 4; i++)
                                rgba[i] = rgba_ovl[i];

                    }
                }
/*
                var rgba_ovl = [0, 0, 0, 0];
                for (var j = 0; j < ovl_num; j++)
                {
                    var ovl = that.overlays[j];
                    if (ovl.visible)
                    {
                        var v = ovl.val;
                        if (v[0] > 0)
                        {
                            if (ovl.histoManager.blending)
                            {
                                var ovalcap = (v[0] > 1) ? 1 : v[0];
                                for (var i = 0; i < 4; i++)
                                {
                                    rgba[i] *= (1 - ovalcap);
                                    rgba[i] += v[i+1]*ovalcap;
                                }
                            }
                            else
                            {
                                for (var i = 0; i < 4; i++)
                                    rgba[i] = v[i+1];
                            }
                        }
                    }
                }
*/
              
            }
            return rgba;
        }

        function mapValtoRGBVol_old(cVal, k, mapper, ovl_num)
        {

            var currentVal = 0;
            var rgba = mapper(cVal, rgba);

            if (ovl_num > 0)
            {
                var rgba_ovl = [0, 0, 0, 0];
                //var cnt = 0;
                for (var j = 0; j < ovl_num; j++)
                {
                    var ovl = that.overlays[j];
                    if (ovl.visible)
                    {
                        var v = ovl.val;
//                        var oVal = ovl.histoManager.mapVal(ovl.val);
//                        var c = colormap.mapValOvl(currentVal, histoManager.cmapindex, oVal, ovl.histoManager.cmapindex,   false);
                        if (v[0] > 0)
                        {
                            if (ovl.histoManager.blending)
                            {
                                var ovalcap = (v[0] > 1) ? 1 : v[0];
                                for (var i = 0; i < 4; i++)
                                {
                                    rgba[i] *= (1 - ovalcap);
                                    rgba[i] += v[i+1]*ovalcap;
                                    // this would be an alternative way to mix color. (dark background stays dark)
                                    //rgba[i] *= v[i+1]/255;
                                }
                            }
                            else
                            {
                                for (var i = 0; i < 4; i++)
                                    rgba[i] = v[i+1];
                            }
                        }
                    }
                }
              
            }


            sliceData.data[k + 0] = rgba[0];
            sliceData.data[k + 1] = rgba[1];
            sliceData.data[k + 2] = rgba[2];
            sliceData.data[k + 3] = rgba[3];
      
            return k;
        }




        ////////////////////////////////

        function putRoiPixel(px, py, pz, k,idx,putVoxel)
        {
    
            var ison = false;
            var len =  that.ROIs_temp.finalLength;
            for (var r = 0; r < len; r++)
            {
                var roi = that.ROIs_temp[r].roi.content;
                var v;
                if (that.ROIs_temp[r].A == undefined || that.ROIs_temp[r].A_isIdentity)
                {
                    if (idx == undefined)
                        idx = roi.widhei * Math.round(pz) + Math.round(py) * roi.wid + Math.round(px);
                    v = roi.data[idx + that.ROIs_temp[r].tOffset];
                }
                else
                {
                    if (that.ROIs_temp[r].mapCoords)
                    {
                        var ps = that.ROIs_temp[r].mapCoords(px,py,pz)
                        v = trilinInterp(roi, ps[0], ps[1], ps[2], that.ROIs_temp[r].A, that.ROIs_temp[r].tOffset);
                    }
                    else
//                        v = NNInterp(roi, px, py, pz, that.ROIs_temp[r].A, that.ROIs_temp[r].tOffset);
                        v = trilinInterp(roi, px, py, pz, that.ROIs_temp[r].A, that.ROIs_temp[r].tOffset);
                    
                }
                if (v >= 0.5)
                {
                    var c = that.ROIs_temp[r].color_mapped;
                    putVoxel(k, [c[0],c[1], c[2],100000] ,  (a,b) => a*(1-state.viewer.roiTransparency) + b*state.viewer.roiTransparency );
                    ison = true;
                }
              
            }
            if (1)
            {
                for (var r = 0; r < that.atlas.length; r++)
                {

                 //   if (that.atlas[r].atlas.editing_label == undefined)
                    {
                        var rgb = that.atlas[r].getPixel(px, py, pz);
                        var alp = rgb[3]
                        putVoxel(k, [rgb[0],rgb[1],rgb[2],255] ,  (a,b) => a * alp*that.atlas[r].atlas.content.alpha + b * (1-that.atlas[r].atlas.content.alpha*alp ) );                    
                    }
                }
            }
        }


        function prepROIs()
        {

            var R;
            if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
                R = math.diag([1, 1, 1, 1]);
            else
                R = getTiltMat(slicingDimOfArray);

            for (var k = 0; k < that.ROIs.length; k++)
            {
                var reorient = math.diag([1, 1, 1, 1]);
                that.ROIs[k].A =(math.multiply(math.multiply(math.multiply(math.inv((that.ROIs[k].roi.content.edges)), reorient), that.nii.edges), R))._data;
                that.ROIs[k].mapCoords = undefined;
                that.ROIs[k].A_isIdentity = sameGeometry(that.ROIs[k].roi.content,that.nii);

                
                if (that.ROIs[k].nii.data_original)
                {             
                    var def = KViewer.roiTool.tmpWarp       
                    var def_edges_inv = math.inv(def.edges);
                    
                    that.ROIs[k].A = math.inv(that.ROIs[k].roi.content.edges)._data
                    that.ROIs[k].Adef = math.multiply(math.multiply(def_edges_inv, that.nii.edges), R)._data;

                    that.ROIs[k].mapCoords = function (x,y,z)
                    {
                       var r = this;
                       return [trilinInterp(def,x,y,z,r.Adef,def.widheidep*0),
                               trilinInterp(def,x,y,z,r.Adef,def.widheidep*1),
                               trilinInterp(def,x,y,z,r.Adef,def.widheidep*2)]
                    }
                    that.ROIs[k].A_isIdentity = false;

                    
                }
                


                if (KViewer.navigationTool.isinstance && 
                   ((KViewer.navigationTool.movingObjs[that.ROIs[k].roi.fileID] != undefined & KViewer.navigationMode == 0) | 
                   (KViewer.navigationMode == 2 & KViewer.mainViewport != -1) ) )
                {
                      if (KViewer.reorientationMatrix.deffield)
                      {
                           
                              var def = KViewer.reorientationMatrix.deffield
                              var def_edges_inv = math.inv(def.edges);
                              var reorient = KViewer.reorientationMatrix.matrix;

                              that.ROIs[k].A = math.inv(that.ROIs[k].roi.content.edges)._data
                              that.ROIs[k].Adef = math.multiply(math.multiply(math.multiply(def_edges_inv, reorient), that.nii.edges), R)._data;

                              var r = that.ROIs[k];
                              that.ROIs[k].mapCoords = function (x,y,z)
                              {
                                   return [trilinInterp(def,x,y,z,r.Adef,def.widheidep*0),
                                           trilinInterp(def,x,y,z,r.Adef,def.widheidep*1),
                                           trilinInterp(def,x,y,z,r.Adef,def.widheidep*2)]
                              }
                              that.ROIs[k].A_isIdentity = false;
                      }
                      else                      
                      {
                        that.ROIs[k].mapCoords = undefined;
                        reorient = KViewer.reorientationMatrix.matrix;
                        that.ROIs[k].A =(math.multiply(math.multiply(math.multiply(math.inv((that.ROIs[k].roi.content.edges)), reorient), that.nii.edges), R))._data;
                        that.ROIs[k].A_isIdentity = isIdentity(that.ROIs[k].A) ;

                      }


                }


                if (Array.isArray(that.ROIs[k].color))
                   that.ROIs[k].color_mapped = that.ROIs[k].color
                else if (that.ROIs[k].color.constructor.name == "KColor")
                   that.ROIs[k].color_mapped = that.ROIs[k].color.color                    
                else 
                   that.ROIs[k].color_mapped = master.roiTool.colors[that.ROIs[k].color];


                if (that.ROIs[k].visible  & (that.ROIs[k].refSurfView == undefined | !that.isGLenabled()))
                {
                    that.ROIs_temp.push(that.ROIs[k]);
                    that.ROIs[k].tOffset = that.ROIs[k].nii.currentTimePoint.t  * that.ROIs[k].roi.content.widheidep;

                }
            }
            that.ROIs_temp.finalLength = that.ROIs_temp.length;

        }

        function prepOverlays(noNativeSlicing)
        {
            var nii = that.nii
        
            var R;
            if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2)
                R = math.diag([1, 1, 1, 1]);
            else
                R = getTiltMat(slicingDimOfArray);

           // prep the overlays
            for (var k = 0; k < that.overlays.length; k++)
            {
                var ovl = that.overlays[k];
                var totsz = ovl.nii.sizes[0] * ovl.nii.sizes[1] * ovl.nii.sizes[2];
                ovl.tOffset_ovl = ovl.nii.currentTimePoint.t * totsz;
                ovl.totsz = totsz;

                var reorient = math.diag([1, 1, 1, 1]);
                var ovledges = (ovl.nii.edges);
                ovl.A = (math.multiply(math.multiply(math.multiply(math.inv(ovledges), reorient), that.nii.edges), R))._data;
                ovl.mapCoords = undefined;
                ovl.A_isIdentity = isIdentity(ovl.A);

                if (KViewer.navigationTool.isinstance && 
                       ((KViewer.navigationTool.movingObjs[ovl.currentFileID] != undefined & KViewer.navigationMode == 0) | (noNativeSlicing & KViewer.navigationMode == 2) ) )
                       {
                           reorient = KViewer.reorientationMatrix.matrix;

                           if (KViewer.reorientationMatrix.deffield)
                           {
                              var def = KViewer.reorientationMatrix.deffield
                              var def_edges_inv = math.inv(def.edges);
                              ovl.Adef = (math.multiply(math.multiply(math.multiply(def_edges_inv, reorient), that.nii.edges), R))._data;

                              ovl.A = math.inv(ovledges)._data;


                              ovl.mapCoords = function (x,y,z)
                              {
                                   var ovl = this;
                                   return [trilinInterp(def,x,y,z,ovl.Adef,def.widheidep*0),
                                           trilinInterp(def,x,y,z,ovl.Adef,def.widheidep*1),
                                           trilinInterp(def,x,y,z,ovl.Adef,def.widheidep*2)]
                              }

                           }
                           else
                           {
                              ovl.A = (math.multiply(math.multiply(math.multiply(math.inv(ovledges), reorient), that.nii.edges), R))._data;
                           }

                       }
            
            

                if (ovl.visible)
                {

                    if (ovl.histoManager.dither > 0)
                       ovl.dither = ovl.histoManager.dither;
                    else 
                       ovl.dither = undefined;


                    if (ovl.nii.sizes[3]%3 == 0 && ovl.showcolored && ovl.showcolored_type != "SOS")
                    {


                            var n = ovl.nii;
                            var Order = KMedViewer.getPermutationOrder(); 
                            var e = (math.multiply(n.edges,math.diag([1/n.voxSize[0],1/n.voxSize[1],1/n.voxSize[2],1])));
//                            e = math.multiply(math.inv(that.nii.edges),e)
                            e = math.multiply((math.multiply(math.diag([n.voxSize[0],n.voxSize[1],n.voxSize[2],1]),math.inv(that.nii.edges))),e);
                            e =  (math.multiply(math.inv(KViewer.reorientationMatrix.matrix),e));
                            e = colorPermutation(e,ovl,ovl.nii);
                            e = e._data;
                            


                            

                           ovl.getPixel = function(px,py,pz) { 
                                var ovl = this;
                                if (ovl.mapCoords)
                                {
                                    var ps = ovl.mapCoords(px,py,pz)
                                    px = ps[0]
                                    py = ps[1]
                                    pz = ps[2]
                                }

                                var c =  trilinInterp3_signcorrected(ovl.nii, px, py, pz, ovl.A,ovl.totsz); 
                                if (c != undefined)
                                {
                                    var q = [0,0,0];
                                    q[0] = ovl.histoManager.mapVal(Math.abs(e[0][0]*c[0] + e[0][1]*c[1] + e[0][2]*c[2]));
                                    q[1] = ovl.histoManager.mapVal(Math.abs(e[1][0]*c[0] + e[1][1]*c[1] + e[1][2]*c[2]));
                                    q[2] = ovl.histoManager.mapVal(Math.abs(e[2][0]*c[0] + e[2][1]*c[1] + e[2][2]*c[2]));
                                    var s = (q[0]+q[1]+q[2])/3;
                                    return [s,q[0]*128,q[1]*128,q[2]*128,255];
                                }
                                else
                                    return [0,0,0,0,0];
                                };
                    }
                    else if (ovl.nii.datatype == "rgb24")
                    {
                        ovl.getPixel = function(px,py,pz) 
                        {
                            var ovl = this;
                            
                            if (ovl.mapCoords)
                            {
                                var ps = ovl.mapCoords(px,py,pz)
                                px = ps[0]
                                py = ps[1]
                                pz = ps[2]
                            }

                            var c =  trilinInterp_rgbnii(ovl.nii, px, py, pz, ovl.A, ovl.tOffset_ovl) || [0,0,0,0];
                            var s = (c[0]+c[1]+c[2])/(3*255) *2 ;
                            //s = .6;
                            return [s, c[0], c[1], c[2], 255];
                        } 
                    }
                    else
                    {
                        var interpfun;
                        var currentVal = 0; // an ancient remain ... 
                        if (ovl.histoManager.blocky | ovl.A_isIdentity)
                            ovl.interpfun = NNInterp;
                        else 
                            ovl.interpfun = trilinInterp;
 
                        var aggregate = 0;
                        if (ovl.showcolored_type == "SOS")
                            aggregate = 1;
                        ovl.getPixel = function(px,py,pz) { 
                                var ovl = this;

                                if (ovl.mapCoords)
                                {
                                    var ps = ovl.mapCoords(px,py,pz)
                                    px = ps[0]
                                    py = ps[1]
                                    pz = ps[2]
                                }


                                var val;
                                if (aggregate == 1)
                                {
                                    val = 0;
                                    var v = trilinInterp3_signcorrected(ovl.nii, px, py, pz, ovl.A, 0);
                                    if (v == undefined)    
                                        return [0,0,0];
                                    val = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
                                }
                                else
                                    val =  ovl.interpfun(ovl.nii, px, py, pz, ovl.A, ovl.tOffset_ovl); 
                                if (isNaN(val))
                                     return [0];
                                if (!ovl.histoManager.posnegsym)
                                {
                                    var oVal = ovl.histoManager.mapVal(val);
                                    if (oVal == undefined)
                                        return [0];
                                    var c = colormap.mapValOvl(currentVal, histoManager.cmapindex,oVal, ovl.histoManager.cmapindex,   false);
                                    return [oVal,c[0],c[1],c[2],c[3]];
                                }
                                else
                                {
                                    if (val > 0)
                                    {
                                        var oVal = ovl.histoManager.mapVal(val);
                                        if (oVal > 0)
                                        {
                                            oVal = oVal/2+0.5;
                                            var c = colormap.mapValOvl(currentVal, histoManager.cmapindex,oVal, ovl.histoManager.cmapindex,   false);
                                            return [oVal,c[0],c[1],c[2],c[3]];
                                        }
                                    }
                                    else
                                    {
                                        var oVal = ovl.histoManager.mapVal(-val);
                                        if (oVal > 0)
                                        {
                                            oVal = (1-oVal)*0.5;
                                            if (oVal < 0.01) oVal = 0.01;
                                            var c = colormap.mapValOvl(currentVal, histoManager.cmapindex, oVal, ovl.histoManager.cmapindex,   false);                                    
                                            return [oVal,c[0],c[1],c[2],c[3]];
                                        }
                                    }
                                    return [0];
                                }
                                };
                    }
                }  
                else
                    ovl.getPixel = undefined;

            }
        }


        /*******************************************************************************************************************************************
        * drawSlice_normal
        *******************************************************************************************************************************************/

     
        var background_color2D = [0,0,0,255]
        function drawSlice_normal(curSl, clipratio, nanrender)
        {
            if (clipratio == undefined)
                clipratio = 0;
            if (state.viewer.background_color)
            {
                background_color2D = new KColor(state.viewer.background_color).color
                that.$container.css('background',state.viewer.background_color);
            }

            var nii = that.nii;

            if (nii.dummy)
                return;
         
       //     currentSlice = math.round(currentVoxel._data[slicingDimOfArray]);

            var this_colmapper = colmapper;

            if (curSl != undefined)
            {
                currentSlice = curSl;

                if (nanrender)
                {
                    this_colmapper = function(cVal)
                    {
                        if (!isNaN(cVal))
                        {
                            currentVal = histoManager.mapVal(cVal);
                            var rgb = colormap.mapVal(currentVal, histoManager.cmapindex);
                            rgb[3] = math.max(currentVal * 255, 0);

                            return rgb;
                        }
                        else
                            return [0, 0, 0, 0];
                    }
                }
            }


            var totsize = nii.sizes[0] * nii.sizes[1] * nii.sizes[2]
            var tOffset = that.nii.currentTimePoint.t*totsize


            // prep the overlays
            prepOverlays(false);

            // prep the rois
            while (that.ROIs_temp.length > 0) {
                that.ROIs_temp.pop();
            }
            prepROIs()

            // prep the atlass
            for (var k = 0; k < that.atlas.length; k++)
            {
                if (KViewer.navigationTool.isinstance && 
                   (( master.navigationTool.movingObjs[that.atlas[k].atlas.fileID] != undefined & KViewer.navigationMode == 0)) )             
                    that.atlas[k].updateGetPixelFunction(nii,getTiltMat(slicingDimOfArray));
                else
                    that.atlas[k].updateGetPixelFunction(nii);
            }

            var sx_, sy_;
            if (slicingDimOfArray == 0)
            {
                sx_ = that.nii.sizes[1];
                sy_ = that.nii.sizes[2];
            }
            if (slicingDimOfArray == 1)
            {
                sx_ = that.nii.sizes[0];
                sy_ = that.nii.sizes[2];
            }
            if (slicingDimOfArray == 2)
            {
                sx_ = that.nii.sizes[0];
                sy_ = that.nii.sizes[1];
            }


            if (swapXY) // for dither 
                mapValtoRGBVol.sx_ = sy_
            else
                mapValtoRGBVol.sx_ = sx_


            var colVol = false;
            var numCol = 0;
            if (nii.sizes[3]%3 == 0)
            {
                numCol = nii.sizes[3]/3;
                colVol = that.showcolored;
                that.colVol_reorient =  colorPermutation(math.diag([1,1,1,1]),that,nii)._data;

                if (nii.sizes[4] > 1)
                {
                    var tOffset0 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * (0 + 3 * that.nii.currentTimePoint.t);
                    var tOffset1 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * (1 + 3 * that.nii.currentTimePoint.t);
                    var tOffset2 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * (2 + 3 * that.nii.currentTimePoint.t);
                }
                else
                {
                    var tOffset0 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * ((0 + that.nii.currentTimePoint.t) % 3);
                    var tOffset1 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * ((1 + that.nii.currentTimePoint.t) % 3);
                    var tOffset2 = nii.sizes[0] * nii.sizes[1] * nii.sizes[2] * ((2 + that.nii.currentTimePoint.t) % 3);
                }
            }

            // THORAX XRAY PROJECT KOTTER
            // special case: for a single slice (e.g. high res X-Ray), use an drawing optimized method 
            // one important factor is: looped operations are much faster when iterated consecutive!!
           /* if (nii.singleSlice)
            {
                var data32 = new Uint32Array(sliceData.data.buffer);
                var clim0 = that.histoManager.clim[0];
                var clim1 = that.histoManager.clim[1];
                var scslope = 255 / (clim1 - clim0);
                var nVoxels = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];

                for (var i = 0; i < nVoxels; i++)
                {
                    var val = (nii.data[i] - clim0) * scslope;
                    if (val > 255)
                        val = 255;
                    if (val < 0)
                        val = 0;
                    var j = 4 * i;
                    sliceData.data[j + 0] = val
                    sliceData.data[j + 1] = val;
                    sliceData.data[j + 2] = val;
                    sliceData.data[j + 3] = 255;

                    //                    data32[i] = (255 << 24) | val << 16 | val << 8 | val;

                }
                sliceDrawUpdateNeeded = false;


                return
            }*/

// ERDO
            if (nii.sizes[slicingDimOfArray] == 1 & (currentSlice >=0.5 | currentSlice < 0))
                currentSlice = 0;

            if (currentSlice < nii.sizes[slicingDimOfArray] & currentSlice >= 0)
            {
                var px, py, pz;
                var ovl_num = that.overlays.length;
                var cr = clipratio
                if (swapXY)
                    cr = [clipratio[1],clipratio[0],clipratio[3],clipratio[2]];

                if (clipratio.length == 4)
                {
                    if (xflip != 0)
                    {
                        var startx = Math.floor(sx_ * (1-cr[2]));
                        var endx = Math.floor(sx_ * (1-cr[0])); //work
                    }
                    else
                    {
                        var startx = Math.floor(sx_ * cr[0]);
                        var endx = Math.floor(sx_ * cr[2]);
                    }

                    if (yflip != 0)
                    {
                        var starty = Math.floor(sy_* (1-cr[3]));
                        var endy = Math.floor(sy_ * (1-cr[1]));
                    }
                    else
                    {
                        var starty = Math.floor(sy_* (cr[1]));
                        var endy = Math.floor(sy_ * (cr[3])); //work
                    }

                    if (clipratio.mosaic)  
                    {
                        var sxclipped = Math.floor(sx*Math.abs(cr[2]-cr[0]));
                        var syclipped = Math.floor(sy*Math.abs(cr[3]-cr[1]));
                        var sx_clipped = Math.floor(sx_*Math.abs(cr[2]-cr[0]));
                        var sy_clipped = Math.floor(sy_*Math.abs(cr[3]-cr[1]));
                        var offsx = startx;
                        var offsy = starty;                        
                    }
                    else 
                    {    
                        var sxclipped = sx;
                        var syclipped = sy; 
                        var sx_clipped = sxclipped;
                        var sy_clipped = syclipped;
                        var offsx = 0;
                        var offsy = 0;
                    }

                }
                else
                {

                    var startx = Math.floor(sx_ * clipratio / 2);
                    var starty = Math.floor(sy_ * clipratio / 2);
                    var offsx = startx;
                    var offsy = starty;
                    var endx = sx_ - Math.floor(sx_ * clipratio / 2);
                    var endy = sy_ - Math.floor(sy_ * clipratio / 2);

                    var sxclipped = Math.floor(sx * (1 - clipratio))
                    var syclipped = Math.floor(sy * (1 - clipratio))
                    var sx_clipped = Math.floor(sx_ * (1 - clipratio))
                    var sy_clipped = Math.floor(sy_ * (1 - clipratio))
                }

                var deltak;
                if (swapXY)
                    deltak = 4*ydir;
                else
                    deltak = 4*ydir*sxclipped;

                var delta_x = that.subsample_factor_x;
                var delta_y = that.subsample_factor_y;

                var half_x =  (delta_x*0.5);
                var half_y =  (delta_y*0.5);

                startx = Math.floor(startx/delta_x)*delta_x;
                starty = Math.floor(starty/delta_y)*delta_y;

                endx -= delta_x;
                endy -= delta_y;

                for (var x = startx; x < endx; x+=delta_x)
                {
            
                    if (swapXY)
                        k = ((sxclipped * xflip + xdir * (x - offsx)/delta_x - xflip) * syclipped + yflip * syclipped + ydir * Math.round((starty - offsy)/delta_y) - yflip) * 4;
                    else
                        k = ((syclipped * yflip + ydir * Math.round((starty - offsy)/delta_y) - yflip) * sxclipped + xflip * sxclipped + xdir * (x - offsx)/delta_x - xflip) * 4;

                    for (var y = starty; y < endy; y+=delta_y)
                    {

                        if (slicingDimOfArray == 0) {
                            px = currentSlice;
                            py = Math.floor(x+half_x);
                            pz = Math.floor(y+half_y)
                        }
                        if (slicingDimOfArray == 1) {
                            px = Math.floor(x+half_x);
                            py = currentSlice;
                            pz = Math.floor(y+half_y);
                        }
                        if (slicingDimOfArray == 2) {
                            px = Math.floor(x+half_x);
                            py = Math.floor(y+half_y);
                            pz = currentSlice;
                        }

                         var ind = nii.widhei * Math.round(pz) + Math.round(py) * nii.wid + Math.round(px);

                        var v = nii.data[ind + tOffset];
                            
                        if (isNaN(v))
                        {
                            k+= deltak;                          
                            continue;
                        }
                        
                        if (!that.visible)
                            v = -999999999;

                        for (var j = 0; j < ovl_num; j++)
                            if (that.overlays[j].getPixel)
                               that.overlays[j].val = that.overlays[j].getPixel(px,py,pz);

                         var ktoplot = k;

                         if (that.nii.datatype == 'rgb24')
                         {
                             // for rgb, data is stored as triplets, so we have to calc the indexing differently
                               var ind_ = 3*( ind + tOffset);
                               mapRGBval( [ nii.data[ind_ + 0], nii.data[ind_+1], nii.data[ind_+2]], ktoplot, rgbmapper, ovl_num ,putVoxel);
                         }
                         else if (colVol)
                         {
                                var c = [0,0,0]
                                var e =  that.colVol_reorient ;   
                                var n = 1; //numCol                             
                                for (var s = 0;s <n;s++)
                                {
                                    var cVal = [ nii.data[ind + tOffset0 + totsize*s*3] , nii.data[ind + tOffset1+ totsize*s*3] , nii.data[ind + tOffset2 + totsize*s*3] ]

                                    if (cVal == undefined)
                                        break;

                                    if (e)
                                    {
                                        c[0] +=  math.abs( e[0][0]*cVal[0] + e[0][1]*cVal[1] + e[0][2]*cVal[2]) 
                                        c[1] +=  math.abs( e[1][0]*cVal[0] + e[1][1]*cVal[1] + e[1][2]*cVal[2]) 
                                        c[2] +=  math.abs( e[2][0]*cVal[0] + e[2][1]*cVal[1] + e[2][2]*cVal[2])
                                    }
                                    else
                                    {
                                        c[0] += math.abs(cVal[0]);
                                        c[1] += math.abs(cVal[1]);
                                        c[2] += math.abs(cVal[2]);
                                    }

                                }
                                mapRGBval([c[0]/n,c[1]/n,c[2]/n],ktoplot, rgbmapper, ovl_num ,putVoxel);
                         }
                         else
                         {
                            mapRGBval(v, 
                                        ktoplot, this_colmapper, ovl_num ,putVoxel);
                         }


                        putRoiPixel(px, py, pz, ktoplot,ind,putVoxel);

                        k+= deltak;


                    }
                    //y
                }
                //x

            }




        }


        /*******************************************************************************************************************************************
        * end of         drawSlice_normal
        *******************************************************************************************************************************************/


        that.imageupdater = signalhandler.attach("updateImage",function(ev)
        {
            if (that.currentFileID == ev.id)
            {
                setSlicingDimOfWorld();
                drawSlice(ev);
             
            }


            for (var k = 0; k < that.atlas.length;k++)
            {
                 if (that.atlas[k].atlas.fileID == ev.id)
                 {
                     drawSlice(ev);
                     if (ev.outlines)
                        that.atlas[k].draw_multioutline()

                     return;
                 }
            }

            for (var k = 0; k < that.ROIs.length;k++)
            {
                if (that.ROIs[k].roi.fileID == ev.id)
                {
                    drawSlice(ev);
                   // if (that.isGLenabled() && !ev.no3d)
                    {
                        setTimeout(function() {
                            KViewer.roiTool.update3D(that.ROIs[k].roi);
                        },0);
                    }
                    return;
                }
            }
            for (var k = 0; k < that.overlays.length;k++)
            {
                if (that.overlays[k].currentFileID == ev.id)
                {
                    drawSlice(ev);
                    return;
                }
            }

            for (var k = 0; k < that.objects3D.length;k++)
            {
                if (that.objects3D[k].overlays)
                {
                    for (var j = 0; j < that.objects3D[k].overlays.length;j++)                    
                    {
                        var x = that.objects3D[k].overlays[j];
                        if (x.surfacecolref)
                        {
                            x.surfacecolref.update();
                        }
                    }

                }
            }

        });


        signalhandler.attach("updateFilelink",function(ev)
        {
            function update()
            {
                that.$timediv.update()
                applySlicingDimOfWorld(slicingDimOfWorld);        
      //          setCanvasLayout();            
                drawSlice();
            }


            for (var k = 0; k < that.quivers.length;k++)
            {
                if (that.quivers[k].parentviewbar.currentFileID  == ev.id)
                {
                    var fileObject = KViewer.dataManager.getFile(ev.id);                    
                    var qp = that.quivers[k].nii.quiver_params
                    that.quivers[k].nii = fileObject.content;
                    that.quivers[k].nii.quiver_params = qp;
                }
            }


            if (that.currentFileID == ev.id)
            {
                var fileObject = KViewer.dataManager.getFile(ev.id);
                that.content = fileObject;
                that.nii  = fileObject.content;
                niiOriginal = that.nii;
                that.niiOriginal = niiOriginal;
                
                update();
            }


            for (var k = 0; k < that.ROIs.length;k++)
            {
                if (that.ROIs[k].roi.fileID == ev.id)
                {
                    var fileObject = KViewer.dataManager.getFile(ev.id);

                    if(0)// must re-create the view, if 4D roi
                    // but code below confuses color and view order
                    {
                        var robj =that.ROIs[k];
                        for (var r = 0; r < robj.divs.length; r++)
                                robj.divs[r].remove();
                        if (robj.outlines != undefined)
                            robj.outlines.close();

                        if (robj.refSurfView != undefined)
                            robj.refSurfView.close();

                        that.ROIs[k] = master.roiTool.createView(fileObject, that, {});
                    }

                    that.ROIs[k].nii = fileObject.content;
                    that.ROIs[k].roi.content = fileObject.content;
                    KViewer.roiTool.update3D(that.ROIs[k].roi);

                    update();
                    return;
                }
            }
            
            for (var k = 0; k < that.overlays.length;k++)
            {
                if (that.overlays[k].currentFileID == ev.id)
                {
                    var fileObject = KViewer.dataManager.getFile(ev.id);
                    that.overlays[k].nii = fileObject.content;
                    KViewer.roiTool.update3D(that.overlays[k]);
                    //if (that.overlays[k].quiver)
                    //    that.quivernii.nii = fileObject.content;
                    update();
                    return;
                }
            }


         
            for (var k = 0; k < that.atlas.length;k++)
            {
                if (that.atlas[k].atlas.fileID == ev.id)
                {
                    var fileObject = KViewer.dataManager.getFile(ev.id);
                    fileObject.content.alpha = that.atlas[k].atlas.content.alpha;
                    that.atlas[k].atlas.content = fileObject.content;
                    KViewer.atlasTool.prepAtlas(fileObject)
                    if (that.atlas[k].atlas.panel != undefined)
                        that.atlas[k].atlas.panel.computeCentroids(that.atlas[k].atlas.content)
                    //if (that.overlays[k].quiver)
                    //    that.quivernii.nii = fileObject.content;
                    update();
                    return;
                }
            }

            
            for (var k = 0; k < that.objects3D.length;k++)
            {
                if (that.objects3D[k].fibers && that.objects3D[k].fibers.fileID == ev.id)
                {
                    var fileObject = KViewer.dataManager.getFile(ev.id);
                    that.objects3D[k].fibers = fileObject;
                     that.objects3D[k].updateFibers();
                }
                if (that.objects3D[k].overlays != undefined)
                {
                    for (var s = 0; s < that.objects3D[k].overlays.length;s++)
                    {
                        if (that.objects3D[k].overlays[s].currentFileID == ev.id)
                        {
                            var fileObject = KViewer.dataManager.getFile(ev.id);
                            that.objects3D[k].overlays[s].nii = fileObject.content;
                            that.objects3D[k].update();
                            //KViewer.roiTool.update3D(that.objects3D[k].overlays[s]);
                            update();

                        }

                    }
                }
            }            
        });





        function getCurrenVoxel()
        {
            return currentVoxel;
        }
        that.getCurrenVoxel = getCurrenVoxel;


        function hasContent(type)
        {
            var c = [];
            for (var k = 0; k < that.objects3D.length;k++)
                if (that.objects3D[k][type] != undefined)
                    c.push(that.objects3D[k]);
            if (c.length > 0)
                return c;
            else
                return undefined;

        }
        that.hasContent = hasContent;

        // used in 3dviewer for info on ctrl hold
        function getValueAtWorldPosition(point)
        {
              var tOffset = 0;
              if (that.nii.currentTimePoint)
                   tOffset = that.nii.currentTimePoint.t * niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2];
              
              var val;
              var whichnii;
              if (!niiOriginal.dummy)
                whichnii = niiOriginal
              else
                {

                }
                
              if (whichnii != undefined)
              {
                  if (whichnii.sizes[3] == 3)
                  {
                     val =  Math.abs(NNInterp(whichnii, point._data[0], point._data[1], point._data[2], math.inv(whichnii.edges)._data, 0) )+ 
                            Math.abs(NNInterp(whichnii, point._data[0], point._data[1], point._data[2], math.inv(whichnii.edges)._data,  whichnii.sizes[0] * whichnii.sizes[1] * whichnii.sizes[2]) )+ 
                            Math.abs(NNInterp(whichnii, point._data[0], point._data[1], point._data[2], math.inv(whichnii.edges)._data,  whichnii.sizes[0] * whichnii.sizes[1] * whichnii.sizes[2]*2)) ;
                  }
                  else
                     val =  NNInterp(niiOriginal, point._data[0], point._data[1], point._data[2], math.inv(that.niiOriginal.edges)._data, tOffset);
              }
              else
                  val = undefined

              if (val != undefined)
              {
                  var value;
                  if (!(that.nii.datascaling.id()))
                    {
                        value = (that.nii.datascaling.e(val)).toFixed(4);
                        value += " (" + val.toFixed(4) + ")";
                    }
                    else
                        value = val.toFixed(4);
                    that.currentValueAt3DWorldPick = value;
              }
              
              that.currentCoordinateAt3DWorldPick = point._data;
              val = math.abs(val)>that.histoManager.clim[0];
              
              return val;
        }
        that.getValueAtWorldPosition = getValueAtWorldPosition;



        function setCurrentVoxel()
        {



            var sliceChanged = false;
            if (that.nii) // && !that.nii.dummy)
            {


                var nii = that.nii;
                var point = getWorldPosition();

                if (master.mainViewport !== -1)
                {
                    point = math.multiply(math.inv(master.reorientationMatrix.matrix), point);
                }
                else
                {
                     // CONGRU
        //            if (KViewer.navigationTool.isinstance && 
          //              (( master.navigationTool.movingObjs[that.currentFileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ))
                    if (isBackgroundMoving() | KViewer.navigationMode == 2)                        
                          point = math.multiply(master.reorientationMatrix.matrix, point);

                }
                var curV = math.multiply(math.inv(nii.edges), point);

                currentVoxel = curV;
                
                var totsz = niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2]; 

                
                var c = currentVoxel._data[slicingDimOfArray] + 0.000001;

                if (c != currentSlice)
                    sliceChanged = true;


// ERDO
                if (nii.sizes[slicingDimOfArray] == 1 && c>=0.5 && c < 1)
                    that.slice_out_of_range = true;
                else

                if (!(c>=0 && c < nii.sizes[slicingDimOfArray]) && nii.sizes[slicingDimOfArray] != 0)
                {
                    sliceChanged = false;
                    that.slice_out_of_range = true;
                }
                else
                    that.slice_out_of_range = false;

                currentSlice = c;




                var tOffset = 0;
                if (nii.currentTimePoint)
                   tOffset = nii.currentTimePoint.t * niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2];
                if (master.mainViewport !== -1)
                {
                    let trafoMatrix;
                    if (KViewer.navigationTool.isinstance &&  
                         (KViewer.navigationTool.movingObjs[that.currentFileID] != undefined | KViewer.navigationMode == 2))
                        trafoMatrix = (math.multiply(math.inv(niiOriginal.edges), master.reorientationMatrix.matrix));
                    else
                        trafoMatrix = math.inv(niiOriginal.edges)
                    currentValue = trilinInterp(niiOriginal, point._data[0], point._data[1], point._data[2], trafoMatrix._data, tOffset);

                }
                else
                {
                    if (niiOriginal.data)
                    {
                        if (niiOriginal.sizes[3] == 3)
                        {
                            var px = NNInterp(niiOriginal, point._data[0], point._data[1], point._data[2], math.inv(nii.edges)._data, 0);
                            var py = NNInterp(niiOriginal, point._data[0], point._data[1], point._data[2], math.inv(nii.edges)._data, totsz);
                            var pz = NNInterp(niiOriginal, point._data[0], point._data[1], point._data[2], math.inv(nii.edges)._data, 2*totsz)
                            currentValue = [px,py,pz];// Math.sqrt(px*px+py*py+pz*pz);
                        }
                        else
                            currentValue = NNInterp(niiOriginal, point._data[0], point._data[1], point._data[2], math.inv(nii.edges)._data, tOffset);
                    }
                }


                for (var k = 0; k < that.atlas.length; k++)
                {
                    that.atlas[k].atlas.currentPoint = point;
                }


                for (var k = 0; k < that.overlays.length; k++)
                {
                    var ovl = that.overlays[k];
                    if (ovl.A)               
                    {
                        if (ovl.nii.sizes[3] <= 3 & ovl.nii.sizes[3] > 1)
                        {
                            ovl.currentValue = [];
                            for (var ki = 0; ki < ovl.nii.sizes[3];ki++)
                                ovl.currentValue[ki] = trilinInterp(ovl.nii, currentVoxel._data[0], currentVoxel._data[1], currentVoxel._data[2], ovl.A, ki*ovl.nii.widheidep)
                        }
                        else
                            ovl.currentValue = trilinInterp(ovl.nii, currentVoxel._data[0], currentVoxel._data[1], currentVoxel._data[2], ovl.A, ovl.tOffset_ovl)
                    }

                }

            }

            if (sliceChanged)
            {
                updateInfoBar();
                
                for (var k = 0; k < that.atlas.length;k++)
                    that.atlas[k].clearMultiOutlines()
            }


            return sliceChanged;
        }




        function createTSeriesPinViewer(ev)
        {
            var tseriesdiv = $("#KseriesViewer");
            var tseriesmax = $("#KseriesViewerMax");
            var tseriesmin = $("#KseriesViewerMin");
            var tseriescurrent = $("#KseriesViewerCurrent");

            if (ev == 'close')
            {
                $(tseriesdiv).remove();
                return;
            }

            if (tseriesdiv.length == 0)
            {
                tseriesdiv = $("<div id='KseriesViewer'> <svg height=180 width=400>" +
                " <polygon points='' style='fill:yellow;stroke:purple;stroke-width:1' />sdkldk</svg></div>").appendTo($(document.body));
                $(tseriesdiv).on("contextmenu", function(ev) {
                    return false;
                });
                $("<div id='KseriesViewerMax'> </div>").appendTo($(tseriesdiv));
                $("<div id='KseriesViewerMin'> </div>").appendTo($(tseriesdiv));
                $("<div id='KseriesViewerCurrent'> </div>").appendTo($(tseriesdiv));
                tseriesdiv = $("#KseriesViewer");
                tseriesmax = $("#KseriesViewerMax");
                tseriesmin = $("#KseriesViewerMin");
                tseriescurrent = $("#KseriesViewerCurrent");
                $(tseriescurrent).css({
                    left: niiOriginal.currentTimePoint.t / niiOriginal.sizes[3] * 200
                });
            }
            tseriesdiv.css({
                display: 'block'
            });
            tseriesdiv.css({
                left: ev.clientX,
                top: ev.clientY
            });

            var tserheight = $(tseriesdiv).height();
            var tserwidth = $(tseriesdiv).width();

            var $poly = $(tseriesdiv).children().children();
            var pstr = "";
            var scfac = 0.1;
            var tser = getCurrentTseries();
            for (var i = 0; i < tser.data.length; i++)
            {
                var v = (tser.data[i] - tser.min) / (tser.max - tser.min);
                if (v == NaN)
                    v = 0;
                pstr = pstr + (tserwidth * i / tser.data.length) + ","
                + (tserheight - 1 * tserheight * v) + " ";
            }
            pstr = pstr + tserwidth + "," + tserheight + " 0," + tserheight;
            $poly.attr("points", pstr);
            $(tseriesmax).text("" + tser.max.toFixed(2));
            $(tseriesmin).text("" + tser.min.toFixed(2));
            $(tseriescurrent).css({
                left: niiOriginal.currentTimePoint.t / niiOriginal.sizes[3] * 200
            });
        }

        function getCurrentTseries()
        {

            var nii = that.nii;
            var point = getWorldPosition();
            //if (master.mainViewport !== -1)
            //   point = math.multiply(math.inv(master.reorientationMatrix.matrix), point);
            var curV = math.multiply(math.inv(niiOriginal.edges), point);

            var max;
            var min;
            var tseries = [];
            var vsz = niiOriginal.sizes[0] * niiOriginal.sizes[1] * niiOriginal.sizes[2];
            for (var k = 0; k < niiOriginal.sizes[3]; k++)
            {
                var v;
                v = trilinInterp(niiOriginal, curV._data[0], curV._data[1], curV._data[2], [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], k * vsz);
                tseries.push(v);
                if (max == undefined | v > max)
                    max = v;
                if (min == undefined | v < min)
                    min = v;
            }
            return {
                data: tseries,
                max: max,
                min: min
            };
        }
        that.getCurrentTseries = getCurrentTseries;


        that.getCurrentFiberView = function()
        {
            for (var k = 0; k < that.objects3D.length; k++)
            {
                if (that.objects3D[k].fibers != undefined)
                    if (that.objects3D[k].isCurrent)
                    {
                        return that.objects3D[k];
                    }
            }

            return;

        }



        return that;

    }


    // =======================  end of medviewer ===============================================================


/********************************************************************
bmpToNIFI
********************************************************************/ 
function bmpToNIFTI(uint8buffer, callback)
{
    // prep canvas
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    // create the image
    var blob = new Blob( [ uint8buffer ], { type: "image" } );
    var urlCreator = window.URL || window.webkitURL;
    var strDataURI = urlCreator.createObjectURL( blob );   
    var img = new Image;

    img.onload = whenloaded;
    img.src = strDataURI;

    function whenloaded()
    {
        
        canvas.width = img.width;     
        canvas.height = img.height;
        

        ctx.drawImage(img,0,0);
        var pixelData = ctx.getImageData(0, 0, img.width, img.height);

        var niihdr = [92, 1, 0, 0, 117, 105, 110, 116, 49, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 0, 1, 0, 16, 0, 16, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 16, 0, 0, 0, 0, 0, 128, 191, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 111, 110, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 191, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 191, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 105, 49, 0, 0, 0, 0, 0];
        var hdrbuffer = (new Uint8Array(niihdr)).buffer;

        var isrgb = true;
        if(isrgb)
        {
            var type = 128;
            var bitpix = 8*3;
        }
        else
        {
            var type = 2;
            var bitpix = 8;
        }

        var sizes = [img.width,img.height,1];

        var cumsize = sizes[0] * sizes[1] * sizes[2];

        var thearray = new Uint8Array(hdrbuffer.byteLength + bitpix / 8 * cumsize );
        var buffer = thearray.buffer;

        var view = new DataView(buffer);
        littleEndian = 1;
        // sizes
        view.setInt32(0, 348, littleEndian)
        view.setInt16(40, 3, littleEndian)
        view.setInt16(42, sizes[0], littleEndian)
        view.setInt16(44, sizes[1], littleEndian)
        view.setInt16(46, sizes[2], littleEndian)
        view.setInt16(48, 1, littleEndian) // time dim
        
        // windowing
        view.setFloat32(124, 255, littleEndian)
        view.setFloat32(128, 0, littleEndian)

        // edges
        var pixsize = 1;
        view.setFloat32(280 + 0 * 4, -pixsize, littleEndian);
        view.setFloat32(280 + 1 * 4, 0, littleEndian);
        view.setFloat32(280 + 2 * 4, 0, littleEndian);
        view.setFloat32(280 + 3 * 4, 0, littleEndian);

        view.setFloat32(280 + 4 * 4, 0, littleEndian);
        view.setFloat32(280 + 5 * 4, -pixsize, littleEndian);
        view.setFloat32(280 + 6 * 4, 0, littleEndian);
        view.setFloat32(280 + 7 * 4, 0, littleEndian);

        view.setFloat32(280 + 8 * 4, 0, littleEndian);
        view.setFloat32(280 + 9 * 4, 0, littleEndian);
        view.setFloat32(280 + 10 * 4, pixsize, littleEndian);
        view.setFloat32(280 + 11 * 4, 0, littleEndian);

        view.setInt16(252, 0, littleEndian)
        //qform
        view.setInt16(254, 1, littleEndian)
        //sform


        // ====== apply some other important stuff
        // set the magic number to n+1
        view.setInt32(344, 1848324352, !littleEndian)
        // set vox offset to 352
        view.setFloat32(108, 352, littleEndian)
        view.setInt32(348, 0, littleEndian);
        view.setInt16(70, type, littleEndian);
        view.setInt16(72, bitpix, littleEndian);
        if(isrgb)
        {
            for(var k=0; k < cumsize; k++)
            {
                view.setUint8(352 + k*3+0 , pixelData.data[k*4+0] , littleEndian);
                view.setUint8(352 + k*3+1 , pixelData.data[k*4+1] , littleEndian);
                view.setUint8(352 + k*3+2 , pixelData.data[k*4+2] , littleEndian);
            }
        }
        else
        {
            for(var k=0; k < cumsize; k++)
                view.setUint8(352 + k , pixelData.data[4*k] , littleEndian);

        }
        
        if(callback)
            callback(thearray);
    }
}


function setSpace(nii,pref)
{

    if (pref == undefined)
        pref = 'ras'

    function mapIt (space)
    {
        var t = space.toLowerCase()
        var m ;
        switch (t)
        {
            case 'ras' :
            case 'right-anterior-superior' : m = ['ras', [1,1,1]]; break;
            case 'las' :
            case 'left-anterior-superior' : m = ['las', [-1,1,1]]; break;
            case 'rps' :
            case 'right-posterior-superior' : m = ['rps', [1,-1,1]]; break;
            case 'lps' :
            case 'left-posterior-superior' : m = ['lps', [-1,-1,1]]; break;
            case 'rai' :
            case 'right-anterior-inferior' : m = ['ras', [1,1,-1]]; break;
            case 'lai' :
            case 'left-anterior-inferior' : m = ['las', [-1,1,-1]]; break;
            case 'rpi' :
            case 'right-posterior-inferior' : m = ['rpi', [1,-1,-1]]; break;
            case 'lpi' :
            case 'left-posterior-inferior' : m = ['lpi', [-1,-1,-1]]; break;
        }
        return m;
    }


    var s = mapIt(nii.space);
    if (s == undefined)
    {
        console.warn("no valid space definition found!");
        return;
    }
    var p = mapIt(pref);

    var flips = [s[1][0]*p[1][0],s[1][1]*p[1][1],s[1][2]*p[1][2]]


    for (var k = 0; k < 3;k++)
    {
        if (flips[k] == -1)
        {
            nii.spaceOrigin[k] = -nii.spaceOrigin[k] ;
            for (var j = 0; j < 3;j++)
                nii.spaceDirections[j][k] = -nii.spaceDirections[j][k];

        }
    }
    

    nii.space = pref;
}



/********************************************************************
prepareMedicalImageData
********************************************************************/ 
function prepareMedicalImageData(nii_in, fobj, intent)
{


    var nii = nii_in;



    nii.updateLimits = function(nii,fobj) {return function() { prepareMedicalImageData(nii, fobj ) } }(nii, fobj);


    // this is spectrum data ...
    if (nii.sizes.length == 1)
        nii.type = 'nii/spectral'
    else
        nii.type = 'nii'

    if (nii.sizes[0] === 1 || nii.sizes[1] === 1  || nii.sizes[2] === 1)
         nii.singleSlice = true;
    else
         nii.singleSlice = false;


    // workaround: in ill nifitis, there might be only zeros in matrix --> everything goes wrong afterwards. Should not be here, since nifti remain the same (save rois ...)
    if (math.sum(nii.spaceDirections[0]) == 0)
        nii.spaceDirections[0] = [1, 0, 0];
    if (math.sum(nii.spaceDirections[1]) == 0)
        nii.spaceDirections[1] = [0, 1, 0];
    if (math.sum(nii.spaceDirections[2]) == 0)
        nii.spaceDirections[2] = [0, 0, 1];

    
    if (state.viewer.spacedef)
    {
        if (state.viewer.spacedef != "NO")
        {
           setSpace(nii,state.viewer.spacedef )
     
        }
    }





    var wsD = math.diag([1,1,1])
    if (nii.space != undefined)
    {
        switch(nii.space.toLowerCase()) {
        case "right-anterior-superior":
        case "ras":
              wsD = math.diag([1,1,1]); break;
        case "left-anterior-superior":
        case "las":
              wsD = math.diag([-1,1,1]); break;
        case "left-posterior-superior":
        case "lps":
             wsD = math.diag([-1,-1,1]); break;
        }

        wsD = wsD._data;
        nii.spaceDirections = math.multiply(math.matrix(nii.spaceDirections),wsD)._data;
        nii.spaceOrigin = math.multiply(wsD,nii.spaceOrigin)._data;
    }

    // permutationOrder gives the order in which the real world is stored in the array

    nii.applyReordering  = function(id)
    {

        var permutationOrder = [findIndexOfGreatest(nii.spaceDirections[0]), findIndexOfGreatest(nii.spaceDirections[1]), findIndexOfGreatest(nii.spaceDirections[2])];

        if (permutationOrder[0] == permutationOrder[1] ||  permutationOrder[0] == permutationOrder[2] || permutationOrder[2] == permutationOrder[1])
        {
            console.warn('something went wrong with slice ordering , assuuming [0,1,2] by default');
            permutationOrder = [0,1,2];
        }

        if (0) // nii.singleSlice)
        {
            nii.arrayReadDirection = [1,1,1];
            nii.permutationOrder = [0,1,2];
            nii.reordering = '';

        }
        else
        {

            var arrayReadDirection = [nii.spaceDirections[0][permutationOrder[0]] < 0 ? -1 : 1, nii.spaceDirections[1][permutationOrder[1]] < 0 ? -1 : 1, nii.spaceDirections[2][permutationOrder[2]] < 0 ? -1 : 1, ];


            nii.arrayReadDirection = arrayReadDirection;
            nii.permutationOrder = permutationOrder;

            // check and apply any reordering
            var Order = KMedViewer.getPermutationOrder(id);
            var perm = Order.perm;
            var flips = Order.flips;
            if (Order.fixed)
            {
                nii.permutationOrder = Order.perm.slice(0);
                nii.arrayReadDirection = Order.flips.slice(0);

            }
            else
            {
                nii.permutationOrder = [perm[nii.permutationOrder[0]], perm[nii.permutationOrder[1]], perm[nii.permutationOrder[2]]];
                nii.arrayReadDirection = [flips[nii.permutationOrder[0]] * nii.arrayReadDirection[0], flips[nii.permutationOrder[1]] * nii.arrayReadDirection[1], flips[nii.permutationOrder[2]] * nii.arrayReadDirection[2]];
            }
            nii.reordering = Order.id;

            nii.invPermOrder = [];
            nii.invPermOrder[nii.permutationOrder[0]] = 0;
            nii.invPermOrder[nii.permutationOrder[1]] = 1;
            nii.invPermOrder[nii.permutationOrder[2]] = 2;
        }

    }
    nii.applyReordering();

    nii.edges = math.eye(4);
    nii.voxSize = [1, 1, 1];


    // spaceDirections are stored column wise (column index first)
    // multiplication in javascript is row-wise defined, therefore transpose at the end
    nii.edges._data[0][0] = nii.spaceDirections[0][0];
    nii.edges._data[0][1] = nii.spaceDirections[0][1];
    nii.edges._data[0][2] = nii.spaceDirections[0][2];
    nii.edges._data[1][0] = nii.spaceDirections[1][0];
    nii.edges._data[1][1] = nii.spaceDirections[1][1];
    nii.edges._data[1][2] = nii.spaceDirections[1][2];
    nii.edges._data[2][0] = nii.spaceDirections[2][0];
    nii.edges._data[2][1] = nii.spaceDirections[2][1];
    nii.edges._data[2][2] = nii.spaceDirections[2][2];
    nii.edges._data[3][0] = nii.spaceOrigin[0];
    nii.edges._data[3][1] = nii.spaceOrigin[1];
    nii.edges._data[3][2] = nii.spaceOrigin[2];
    nii.edges = math.transpose(nii.edges);


    nii.voxSize[0] = math.sqrt(nii.spaceDirections[0][0] * nii.spaceDirections[0][0] + nii.spaceDirections[0][1] * nii.spaceDirections[0][1] + nii.spaceDirections[0][2] * nii.spaceDirections[0][2]);
    nii.voxSize[1] = math.sqrt(nii.spaceDirections[1][0] * nii.spaceDirections[1][0] + nii.spaceDirections[1][1] * nii.spaceDirections[1][1] + nii.spaceDirections[1][2] * nii.spaceDirections[1][2]);
    nii.voxSize[2] = math.sqrt(nii.spaceDirections[2][0] * nii.spaceDirections[2][0] + nii.spaceDirections[2][1] * nii.spaceDirections[2][1] + nii.spaceDirections[2][2] * nii.spaceDirections[2][2]);


    nii.edges_noscale = math.multiply(nii.edges,math.diag([1/nii.voxSize[0],1/nii.voxSize[1],1/nii.voxSize[2],1]))
    var r0 = 0.98;
    var r1 = 1.02;

    //if (nii_in.pixdim[1].toFixed(1) != nii.voxSize[0].toFixed(1) | nii_in.pixdim[2].toFixed(1) != nii.voxSize[1].toFixed(1) | nii_in.pixdim[2].toFixed(1) != nii.voxSize[1].toFixed(1))
    if (!(nii_in.pixdim[1]/nii.voxSize[0] > r0 & nii_in.pixdim[1]/nii.voxSize[0] < r1 & 
          nii_in.pixdim[2]/nii.voxSize[1] > r0 & nii_in.pixdim[2]/nii.voxSize[1] < r1 & 
          nii_in.pixdim[3]/nii.voxSize[2] > r0 & nii_in.pixdim[3]/nii.voxSize[2] < r1  
    ))
    {
        if (nii.voxSize[0] < 0.0000001 & nii.voxSize[1] < 0.0000001 & nii.voxSize[2] < 0.0000001)
        {
           nii.voxSize[0] = nii_in.pixdim[1];
           nii.voxSize[1] = nii_in.pixdim[2];
           nii.voxSize[2] = nii_in.pixdim[3];
           nii.edges = math.matrix([[nii.voxSize[0],0,0,0],[0,nii.voxSize[1],0,0],[0,0,nii.voxSize[2],0],[0,0,0,1]])

        }
        else
            console.warn('warning: nifti voxelsizes inconsistent,' + nii_in.pixdim.toString());
    }

    if(fobj && fobj.fileinfo)
    {
        var coreginfo = KViewer.dataManager.coregInfos[fobj.fileinfo.ID] || 
                        KViewer.dataManager.coregInfos[fobj.fileinfo.patients_id + fobj.fileinfo.studies_id];
                        
        
        //if(coreginfo && coreginfo.matrix && nii.descrip !== "mni") // can lead to conflicts if mni is set in descrip but overwritten with cmap
        if(coreginfo && coreginfo.matrix)
        {
            var coregmat = coreginfo.matrix;
            nii.original_edges = nii.nii;
            nii.coreginfo = coreginfo;
            nii.edges = math.multiply(math.matrix(coregmat), nii.edges );
            if (!coreginfo.IDspecific)
                console.log("Coregmat found, transforming study")
            else
                console.log("Coregmat found, transforming img " + coreginfo.filepath_target)
        }
    }



    nii.detsign = math.sign(math.det(nii.edges));


    nii.currentTimePoint = {
        t: 0
    };


    if (nii.sizes.length < 3)
        nii.sizes[2] = 1;
    if (nii.sizes.length < 4)
        nii.sizes[3] = 1;
    if (nii.sizes.length < 5)
        nii.sizes[4] = 1;

    if (nii.sizes[4] == 1 | nii.sizes[4] == undefined)
        nii.numTimePoints = nii.sizes[3] ;
    else
        nii.numTimePoints = nii.sizes[4] ;


    nii.centerVoxel = math.matrix([Math.floor(nii.sizes[0] / 2),Math.floor(nii.sizes[1] / 2),Math.floor(nii.sizes[2] / 2),  1]);
    nii.centerWorld = math.multiply(nii.edges, nii.centerVoxel);


    //console.log(Date.now().toString().substr(8) + "  ========== NIFTI edges ====== detsign " + nii.detsign + " \n" + print_matrix(nii.edges._data));


    // --------- create a test image --------
    if (0)
    {
        swapXY = 0;
        nii.arrayReadDirection = [1, -1, 1];
        slicingDimOfArray = 2;
        var ssx = nii.sizes[0];
        var ssy = nii.sizes[1];
        var ssz = nii.sizes[2];
        for (var z = 0; z < ssz - 10; z++)
        {
            for (var y = 0; y < ssy / 2; y++)
            {
                for (var x = 0; x < ssx; x++)
                {
                    nii.data[ssx * ssy * z + ssx * y + x] = x / ssx * 3;
                }
            }
        }
    }


    nii.widheidep = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];
    nii.widhei = nii.sizes[0] * nii.sizes[1];
    nii.wid = nii.sizes[0];



    // calculate the mean of the image for auto colormap
    nii.histogram = new Object
    var numsamples = 50001;

    var n = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];
    
    // 4D data?
    if( (nii.sizes.length) >= 4 )
        n *= nii.sizes[3];

    try { eval(' nii.descrip = {'+nii.descrip+'}'); } catch(err) {}

    // get the max and min of the whole array.
    {
        var minmax = getMinMax(nii.data, n, numsamples);
        var max = minmax.max;
        var min = minmax.min;
    }


    // CT scan speciality:
    if( nii.scl_inter == -1024)
    {
        var min = 1000;
        var max = 1200;
    }


    var nbins = 1000;
    // fine histo to compute quantiles
    nii.histogram = comphisto(min, max, nbins, nii.data, n, numsamples)


    if (nii.histogram.accus.maxfreq > 0)
    {
        var EPSILON = 0.01;

        var i = 0;
        var sum = 0;
        while (sum <= 3)
            sum += nii.histogram.accus[i++];
        min = nii.histogram.min + (nii.histogram.max - nii.histogram.min) * (i - 1) / nbins;
        sum = 0;

        i = 0;
        while (sum <= 97)
            sum += nii.histogram.accus[i++];
        max = nii.histogram.min + (nii.histogram.max - nii.histogram.min) * (i - 1) / nbins;

        min = min - EPSILON;
        // add -eps to max. important.
        max = max + EPSILON;
        // add eps to max. important.
    }
    else
    {
        min = nii.histogram.min;
        max = nii.histogram.max;
    }



    if (nii.descrip.hlim != undefined)
    {
        min = nii.datascaling.ie(nii.descrip.hlim[0]);
        max = nii.datascaling.ie(nii.descrip.hlim[1]);
    }


    var nbins_final = 30;

    //numsamples_final = Math.min(math.round(max-min),nbins_final);

    // compute final histo
    nii.histogram = comphisto(min + 0.02 * (max - min), max + 0.1 * (max - min), nbins_final, nii.data, n, numsamples)


    // can set the outer lims for the histogram manually as string parameter "a,b" for the auotloader
    if (intent !== undefined)
    {
        if (intent.clim_outer !== undefined)
        {
            min = parseFloat(intent.clim_outer.split(',')[0]);
            max = parseFloat(intent.clim_outer.split(',')[1]);
            nii.histogram = comphisto(min, max, nbins_final, nii.data, n, numsamples)
        }
    }



    return nii;
}




// ======================================================================================
// ======================================================================================
// == KColorMap
// ======================================================================================
// ======================================================================================

/** Object to orgainze colormaps and map values to rgb indexed colors
* @class  */



function KColormap()
{
    n = 256;
    var hot = [[], [], []];
    //new Array();
    // ------ hot
    for (var k = 0; k < n; k++)
    {
        if (k < 95)
        {
            hot[0][k] = k / 94 * 255;
            hot[1][k] = 0;
            hot[2][k] = 0;
        }
        if (k >= 95 & k < 195)
        {
            hot[0][k] = n - 1;
            hot[1][k] = (k - 95) / 95.0 * (n - 1);
            hot[2][k] = 0;
        }
        if (k >= 195)
        {
            hot[0][k] = n - 1;
            hot[1][k] = n - 1;
            hot[2][k] = (k - 195) / 101.0 * (n - 1);
        }

    }


    var cgray = [[], [], []];
    var red = [[], [], []];
    var green = [[], [], []];
    var blue = [[], [], []];
    for (var k = 0; k < n; k++)
    {
        cgray[0][k] = k;
        cgray[1][k] = k;
        cgray[2][k] = k;
        red[0][k] = k;
        red[1][k] = 0;
        red[2][k] = 0;
        green[0][k] = 0;
        green[1][k] = k;
        green[2][k] = 0;
        blue[0][k] = 0;
        blue[1][k] = 0;
        blue[2][k] = k;
    }

    var jet  = KColormap.jet;
    var cold = KColormap.cold;
    var rsp  = KColormap.rsp;
    var btr  = KColormap.btr;
    var syngo1  = KColormap.syngo1;
    var syngo2  = KColormap.syngo2;
    /* MATLAB code to generate colormps
    x = jet(256);

    strr = '['; strg = '['; strb = '[';
    for k = 1:256,
        strr = [strr sprintf('%0.f,',(x(k,1)*255))];
        strg = [strg sprintf('%0.f,',(x(k,2)*255))];
        strb = [strb sprintf('%0.f,',(x(k,3)*255))];
    end;
    fprintf(['[' strr(1:end-1) '], \n ' strg(1:end-1) '], \n ' strb(1:end-1) ']  ]\n '])
    */

    var that = {};
    that.names = ["gray", "hot", "jet", "cold", "rsp", "btr", "syngo1", "syngo2", "unicolor","upperThres", "lowerThres"];
    that.maps = [cgray, hot, jet, cold, rsp, btr, syngo1, syngo2];
    that.mapVal = mapVal;
    that.mapValOvl = mapValOvl;
    that.numCmaps = that.names.length;


    for (var j = 0; j < KColor.list.length;j++)
    {
        var c = KColor.list[j]
        var cm =  [[], [], []];
        for (var k = 0; k < n; k++)
        {
            cm[0][k] = Math.floor(k*c[0]/255);
            cm[1][k] = Math.floor(k*c[1]/255);
            cm[2][k] = Math.floor(k*c[2]/255);
        }
        that.maps[100+j] = cm;
    }




    function mapIndex(name)
    {
        if (name >= 100)
            return name
        for (var k = 0; k < that.numCmaps; k++)
        {
            if (that.names[k].search(name) != -1)
                return k;
        }
        return -1;
    }
    that.mapIndex = mapIndex;


    /** maps scalar value between 0 and 1 to color triple
    * @param {number} val -  the value 
    * @param {number} i -  index of colomap
    */
    function mapVal(val, i)
    {
        var alpha = 255;
        if (i >= that.numCmaps - 2  && i < 100)
        {
            return [255 * val, 0, 0, alpha];
        }
        else
        {
        	
        	var cmap = colormap.maps[i];
        	if(cmap==undefined)
        		cmap = colormap.maps[0];
            var v = Math.floor(val * 255);
            if (v < 0)
                v = 0;
            if (v > 255)
                v = 255;
            if (v == 0)
                return [cmap[0][v], cmap[1][v], cmap[2][v], 0];
            else
                return [cmap[0][v], cmap[1][v], cmap[2][v], 255];
        }
    }


    /** maps two scalar value between 0 and 1 to color triple
    * @param {number} val -  background value 
    * @param {number} j -  index of colormap for background
    * @param {number} oVal -  overlay value 
    * @param {number} i -  index of colormap of overlay
    * @param {logical} blend - type of overlay
    */
    function mapValOvl(val, j, oVal, i, blend)
    {
        var rgba = mapVal(val, j);

        if (i >= that.numCmaps - 2 && i < 100) // upper/lower threshold on overlay
        {
            if (blend)
            {
                if (val < 0)
                    return [0, 0, 0, 255];
                else
                {
                    var tc = (1 - oVal * 0.25);
                    return [oVal * 255 + rgba[0] * (1 - oVal), rgba[1] * tc, rgba[2] * tc, 255];
                }
            }
            else
            {
                if (oVal > 0.5 & val >= 0)
                    return [255, 0, 0, 255];
                else
                    return rgba;
            }
        }
        else
        {
            if (oVal < 0)
                oVal = 0;
            if (oVal > 1)
                oVal = 1;
            var oIdx = Math.round(oVal * 255);
            if (oIdx < 0)
                oIdx = 0;
            if (oIdx > 255)
                oIdx = 255;
            if (blend)
            {
                var ic = (1 - val);
                if (ic < 0)
                    ic = 0;
                ic = math.pow(ic, 0.5);
                return [colormap.maps[i][0][oIdx] * ic + rgba[0],
                colormap.maps[i][1][oIdx] * ic + rgba[1],
                colormap.maps[i][2][oIdx] * ic + rgba[2], 255];
            }
            else
            {
                if (oVal == 0)
                {
                    return rgba;
                }
                else
                {
                    return [colormap.maps[i][0][oIdx],
                    colormap.maps[i][1][oIdx],
                    colormap.maps[i][2][oIdx], 255];
                }
            }
        }
    }

    /** colorlim presets
    */

    // in pacs given as center / width
    that.colorlimpresets = 
    [
        {title: "Auto (from zero)",      min:    0,             max:'auto'},
        {title: "Auto",                  min:  'auto',          max:'auto'},
        {title: "CT Brain tissue",       min:   50 - 100/2,     max:50 + 100/2},
        {title: "CT Bone",               min:  500 - 2000/2,    max:500 + 2000/2},
        {title: "CT Soft tissue",        min:   50 - 350/2,     max:50 + 350/2},
        {title: "CT Liver",              min:  100 - 200/2,     max:100 + 200/2},
        {title: "CT Lung",               min: -500 - 1440/2,    max:-500 + 1440/2},
    ]

    return that;


}

KColormap.jet = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128, 131, 135, 139, 143, 147, 151, 155, 159, 163, 167, 171, 175, 179, 183, 187, 191, 195, 199, 203, 207, 211, 215, 219, 223, 227, 231, 235, 239, 243, 247, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 247, 243, 239, 235, 231, 227, 223, 219, 215, 211, 207, 203, 199, 195, 191, 187, 183, 179, 175, 171, 167, 163, 159, 155, 151, 147, 143, 139, 135, 131, 128],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128, 131, 135, 139, 143, 147, 151, 155, 159, 163, 167, 171, 175, 179, 183, 187, 191, 195, 199, 203, 207, 211, 215, 219, 223, 227, 231, 235, 239, 243, 247, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 247, 243, 239, 235, 231, 227, 223, 219, 215, 211, 207, 203, 199, 195, 191, 187, 183, 179, 175, 171, 167, 163, 159, 155, 151, 147, 143, 139, 135, 131, 128, 124, 120, 116, 112, 108, 104, 100, 96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 12, 8, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 135, 139, 143, 147, 151, 155, 159, 163, 167, 171, 175, 179, 183, 187, 191, 195, 199, 203, 207, 211, 215, 219, 223, 227, 231, 235, 239, 243, 247, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 247, 243, 239, 235, 231, 227, 223, 219, 215, 211, 207, 203, 199, 195, 191, 187, 183, 179, 175, 171, 167, 163, 159, 155, 151, 147, 143, 139, 135, 131, 128, 124, 120, 116, 112, 108, 104, 100, 96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 12, 8, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];

KColormap.cold = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], 
 [254,253,252,251,250,249,248,247,246,245,244,243,242,241,240,239,238,237,236,235,234,233,232,231,230,229,228,227,226,225,224,223,222,221,220,219,218,217,216,215,214,213,212,211,210,209,208,207,206,205,204,203,202,201,200,199,198,197,196,195,194,193,192,191,190,189,188,187,186,185,184,183,182,181,180,179,178,177,176,175,174,173,172,171,170,169,168,167,166,165,164,163,162,161,160,159,158,157,156,155,154,153,152,151,150,149,148,147,146,145,144,143,142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,128,127,126,125,124,123,122,121,120,119,118,117,116,115,114,113,112,111,110,109,108,107,106,105,104,103,102,101,100,99,98,97,96,95,94,93,92,91,90,89,88,87,86,85,84,83,82,81,80,79,78,77,76,75,74,73,72,71,70,69,68,67,66,65,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0].reverse(), 
 [255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255].reverse()  ]


KColormap.rsp = [[59,60,62,63,64,65,67,68,69,70,72,73,74,75,77,78,79,80,82,83,84,86,87,88,89,91,92,93,94,96,97,98,99,101,102,103,104,106,107,108,110,111,112,113,115,116,117,118,120,121,122,123,125,126,127,128,130,131,132,134,135,136,137,139,140,142,143,144,145,147,148,149,151,152,153,154,156,157,158,159,161,162,163,164,166,167,168,169,171,172,173,175,176,177,178,180,181,182,183,185,186,187,188,190,191,192,193,195,196,197,199,200,201,202,204,205,206,207,209,210,211,212,214,215,216,217,219,220,220,220,219,219,219,218,218,218,217,217,217,217,216,216,216,215,215,215,214,214,214,213,213,213,212,212,212,212,211,211,211,210,210,210,209,209,209,208,208,208,207,207,207,207,206,206,206,205,205,205,204,204,204,203,203,203,202,202,202,201,201,201,201,200,200,199,199,199,199,198,198,198,197,197,197,196,196,196,195,195,195,194,194,194,193,193,193,193,192,192,192,191,191,191,190,190,190,189,189,189,188,188,188,188,187,187,187,186,186,186,185,185,185,184,184,184,183,183,183,183,182,182,182,181,181,181,180,180],
 [76,77,78,79,81,82,83,84,85,86,87,88,90,91,92,93,94,95,96,97,99,100,101,102,103,104,105,106,108,109,110,111,112,113,114,116,117,118,119,120,121,122,123,125,126,127,128,129,130,131,132,134,135,136,137,138,139,140,142,143,144,145,146,147,149,150,151,152,153,154,156,157,158,159,160,161,162,164,165,166,167,168,169,170,171,173,174,175,176,177,178,179,180,182,183,184,185,186,187,188,190,191,192,193,194,195,196,197,199,200,201,202,203,204,205,206,208,209,210,211,212,213,214,215,217,218,219,220,220,218,217,215,213,212,210,208,206,205,203,201,200,198,196,195,193,191,190,188,186,184,183,181,179,178,176,174,173,171,169,167,166,164,162,161,159,157,156,154,152,151,149,147,145,144,142,140,139,137,135,134,132,130,129,127,125,123,122,120,118,117,115,113,111,109,107,106,104,102,101,99,97,95,94,92,90,89,87,85,84,82,80,79,77,75,73,72,70,68,67,65,63,62,60,58,57,55,53,51,50,48,46,45,43,41,40,38,36,34,33,31,29,28,26,24,23,21,19,18,16,14,12,11,9,7,6,4],
 [192,192,192,193,193,193,193,194,194,194,194,194,195,195,195,195,196,196,196,196,196,197,197,197,197,197,198,198,198,198,199,199,199,199,199,200,200,200,200,201,201,201,201,201,202,202,202,202,203,203,203,203,203,204,204,204,204,205,205,205,205,205,206,206,206,206,207,207,207,207,207,208,208,208,208,209,209,209,209,209,210,210,210,210,211,211,211,211,211,212,212,212,212,213,213,213,213,213,214,214,214,214,215,215,215,215,215,216,216,216,216,216,217,217,217,217,218,218,218,218,218,219,219,219,219,220,220,220,220,219,217,216,214,213,211,210,209,207,206,204,203,201,200,199,197,196,194,193,191,190,189,187,186,184,183,181,180,179,177,176,174,173,171,170,169,167,166,164,163,161,160,159,157,156,154,153,151,150,149,147,146,144,143,141,140,139,137,136,134,133,131,130,128,127,125,124,122,121,119,118,117,115,114,112,111,109,108,107,105,104,102,101,99,98,97,95,94,92,91,89,88,87,85,84,82,81,79,78,77,75,74,72,71,69,68,67,65,64,62,61,59,58,57,55,54,52,51,49,48,47,45,44,42,41,39,38]];

KColormap.btr = 
[[ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,4,5,6,8,9,9,10,11,11,11,11,11,11,11,10,10,9,8,8,7,6,5,5,4,3,2,2,1,1,0,0,0,0,0,1,1,2,3,5,6,8,10,12,15,18,21,24,28,32,36,41,46,51,56,62,67,73,80,86,93,100,107,114,120,125,131,136,141,147,152,157,162,167,171,176,180,185,189,193,197,200,204,208,211,214,217,220,222,225,227,230,232,234,236,237,239,241,242,243,244,246,247,247,248,249,250,250,251,251,252,252,253,253,253,254,254,254,254,254,254,254,255,255,255,255,255,255,251,247,243,239,235,231,227,223,219,215,211,207,203,199,195,191,187,183,179,175,171,167,163,159,155,151,147,143,139,135,131,127 ]
,[ 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,8,12,16,20,24,28,32,36,40,44,48,52,55,59,63,67,71,75,79,82,86,90,93,97,101,104,107,111,114,117,120,123,126,129,132,134,136,139,141,143,144,146,147,148,149,150,150,151,151,150,150,149,148,147,146,144,142,140,137,135,132,129,125,120,114,109,103,98,92,86,81,76,70,65,60,55,50,46,41,37,32,29,25,21,18,15,12,10,7,5,4,2,1,1,0,0,0,1,1,2,4,5,7,10,12,15,18,21,25,29,32,37,41,46,50,55,60,65,70,76,81,86,92,98,103,109,114,118,121,124,127,130,133,135,137,139,141,142,143,144,144,145,145,144,144,144,143,142,140,139,137,136,134,131,129,127,124,122,119,116,113,110,106,103,100,96,93,89,86,82,78,75,71,67,63,59,55,51,48,44,40,36,32,28,24,20,16,12,8,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 ]
,[ 131,135,139,143,147,151,155,159,163,167,171,175,179,183,187,191,195,199,203,207,211,215,219,223,227,231,235,239,243,247,251,255,255,255,255,255,255,255,255,254,254,254,254,254,254,254,253,253,253,252,252,251,251,250,250,249,248,247,247,246,244,243,242,241,239,237,236,234,232,230,227,225,222,220,217,214,211,208,204,200,197,193,189,185,180,176,171,167,162,157,152,147,141,136,131,125,118,111,104,97,90,83,77,71,65,59,54,49,44,39,35,31,27,23,20,17,14,12,10,8,6,4,3,2,1,1,0,0,0,0,0,1,1,2,2,3,3,4,5,6,6,7,8,8,9,9,9,9,9,9,9,9,8,8,7,6,5,3,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 ]]

KColormap.syngo1 = 
[[0,16,32,48,64,65,67,68,70,71,73,74,76,77,79,80,82,83,85,86,88,90,92,94,96,94,92,90,88,86,85,83,82,80,79,77,76,74,73,71,70,68,67,65,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,65,66,66,67,68,69,69,70,71,72,73,74,74,75,76,77,77,78,79,80,81,82,82,83,84,85,85,86,87,88,89,90,90,91,92,93,93,94,95,96,97,98,98,99,100,101,101,102,102,103,104,105,106,106,107,108,109,109,110,111,112,113,114,114,115,116,117,117,118,119,120,121,122,122,123,124,125,125,126,127,129,131,132,134,136,138,139,141,143,145,147,149,150,152,154,156,157,159,161,163,165,167,168,170,172,174,175,177,179,181,183,185,186,187,189,191,193,194,196,198,200,202,204,205,207,209,211,212,214,216,218,220,222,223,225,227,229,230,232,234,236,238,240,241,243,245,247,248,250,252,255,253,252,251,250,248,247,246,245,243,242,240,239,238,237,235,234,233,232,230,229,227,226,225,225]
,[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,7,10,13,16,20,23,26,29,32,36,39,42,45,49,52,55,58,61,63,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,65,68,70,73,75,77,79,82,84,87,89,92,94,97,99,101,103,106,108,111,113,116,118,121,123,125,127,130,132,135,137,140,142,145,147,149,151,154,156,159,161,164,166,169,171,173,175,178,180,182,185,187,190,192,195,197,199,201,204,206,209,211,214,216,219,221,223,225,228,230,233,235,238,240,243,245,247,249,252,254,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,254,244,235,225,216,206,197,187,178,168,159,149,140,131,122,112,103,93,84,74,65,55,46,41,37]
,[0,16,32,48,64,65,67,68,70,71,73,74,76,77,79,80,82,83,85,86,88,90,92,94,96,97,99,100,102,103,105,106,108,109,111,112,114,115,117,118,120,122,124,126,128,130,134,137,141,144,148,151,155,158,162,165,169,172,176,179,183,186,190,193,197,200,204,207,211,214,218,221,225,228,232,235,239,242,246,250,254,253,250,246,243,240,237,233,230,227,224,221,218,214,211,208,205,202,198,195,192,189,186,183,179,176,173,170,166,163,160,157,154,151,147,144,141,138,134,131,128,125,122,119,115,112,109,106,102,100,97,94,91,87,84,81,78,74,71,68,65,62,59,55,52,49,46,42,39,36,33,30,27,23,20,17,14,10,7,4,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,4,5,6,8,9,10,11,13,14,16,17,18,19,21,22,23,24,26,27,29,30,31]]

KColormap.syngo2 =
[[0,96,191,190,188,186,184,182,180,178,176,174,172,169,167,165,163,161,159,157,155,153,151,149,147,145,143,141,139,137,135,133,131,128,126,124,122,120,118,116,114,112,110,108,106,104,102,100,98,96,94,92,90,88,85,83,81,79,77,75,73,71,69,67,64,63,62,61,60,59,58,57,56,55,54,53,52,51,50,49,48,47,46,45,44,43,42,41,40,39,38,37,36,35,34,33,32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,2,6,10,14,18,22,26,30,34,38,42,46,50,54,58,62,66,70,74,78,82,86,90,94,98,102,106,110,114,118,122,126,129,133,137,141,145,149,153,157,161,165,169,173,177,181,185,189,193,197,201,205,209,213,217,221,225,229,233,237,241,245,249,252,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]
,[0,0,0,1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,53,54,55,56,57,58,59,60,61,62,63,63,64,66,69,72,75,78,81,84,87,90,93,96,99,102,105,108,111,114,117,120,123,126,129,132,135,138,141,144,147,150,153,156,159,162,165,168,171,174,177,180,183,186,189,192,195,198,201,204,207,210,213,216,219,222,225,228,231,234,237,240,243,246,249,251,254,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,254,250,246,242,238,233,229,225,221,217,213,209,205,201,197,192,188,184,180,176,172,168,164,160,156,151,147,143,139,135,131,127,124,120,115,111,107,103,99,95,91,87,83,79,75,70,66,62,58,54,50,46,42,38,34,29,25,21,17,13,9,6,3]
,[0,96,191,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,252,248,244,240,236,232,228,224,220,216,212,208,204,200,196,192,188,184,180,176,172,168,164,160,156,152,148,144,140,136,132,128,125,121,117,113,109,105,101,97,93,89,85,81,77,73,69,65,61,57,53,49,45,41,37,33,29,25,21,17,13,9,5,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]

// ======================================================================================





    function findIndexOfGreatest(array) {
        var greatest;
        var indexOfGreatest;
        for (var i = 0; i < array.length; i++) {
            if (!greatest || Math.abs(array[i]) > greatest) {
                greatest = Math.abs(array[i]);
                indexOfGreatest = i;
            }
        }
        return indexOfGreatest;
    }


    var indexOf = function(needle) {
        if (typeof Array.prototype.indexOf === 'function') {
            indexOf = Array.prototype.indexOf;
        } else {
            indexOf = function(needle) {
                var i = -1
                  , index = -1;

                for (i = 0; i < this.length; i++) {
                    if (this[i] === needle) {
                        index = i;
                        break;
                    }
                }

                return index;
            }
            ;
        }

        return indexOf.call(this, needle);
    }
    ;



    function mov(ev)
    {
        if (ev.originalEvent.mozMovementX !== undefined)
            return {
                X: ev.originalEvent.mozMovementX,
                Y: ev.originalEvent.mozMovementY
            };
        else
            return {
                X: ev.originalEvent.movementX,
                Y: ev.originalEvent.movementY
            };
    }

  

    function calcRotmatForVectors(e, v)
    {
        if (e.hasOwnProperty('_data'))
            e = e._data;
        if (v.hasOwnProperty('_data'))
            v = v._data;

        e = e.slice(0, 3);
        v = v.slice(0, 3);
        var vnorm = math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
        v[0]/=vnorm; v[2]/=vnorm; v[1]/=vnorm;
        var w = math.cross(e, v);
        if (w._data)
            w = w._data;
        var s = math.norm(w);
        if (math.abs(s) < 0.00001)
            return math.eye(4);
        var c = math.sqrt(1 - s * s);
        var a = 1 - c
        w = math.multiply(w, 1 / s)._data;
        var R =
        [[c + a * w[0] * w[0], a * w[0] * w[1] - s * w[2], a * w[0] * w[2] + s * w[1], 0],
        [a * w[1] * w[0] + s * w[2], c + a * w[1] * w[1], a * w[1] * w[2] - s * w[0], 0],
        [a * w[2] * w[0] - s * w[1], a * w[2] * w[1] + s * w[0], c + a * w[2] * w[2], 0], [0, 0, 0, 1]];
        return R;
    }

    function NNInterp(thenii, px, py, pz, A, offs)
    {
        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = Math.round(xs);
        var yi = Math.round(ys);
        var zi = Math.round(zs);
        if (zi < thenii.sizes[2] && zi >= 0 && yi < thenii.sizes[1] && yi >= 0 && xi < thenii.sizes[0] && xi >= 0)
        {
            var currentIndex000 = (thenii.widhei * zi + yi * thenii.wid + xi) % thenii.widheidep + offs;
            return thenii.data[currentIndex000];
        }

        return undefined;

    }


    function trilinInterp_MAP(thenii, px, py, pz, A, offs, mapval)
    {


        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = math.floor(xs);
        var yi = math.floor(ys);
        var zi = math.floor(zs);
        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi;
        var currentVal = 0;
        if (zi < thenii.sizes[2]  && zi >= 0 && yi < thenii.sizes[1] - 1 && yi >= 0 && xi < thenii.sizes[0] - 1 && xi >= 0)
        {
            currentIndex000 = thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + xi + offs;
            currentIndex100 = thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + xi + offs;
            currentIndex010 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + xi + offs;
            currentIndex001 = thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + (xi + 1) + offs;
            currentIndex110 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + xi + offs;
            currentIndex011 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + (xi + 1) + offs;
            currentIndex101 = thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;
            currentIndex111 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;
            currentVal = (thenii.data[currentIndex000] == mapval) * (1 - xf) * (1 - yf) * (1 - zf) +
            (thenii.data[currentIndex100] == mapval) * (1 - xf) * (yf) * (1 - zf) +
            (thenii.data[currentIndex010] == mapval) * (1 - xf) * (1 - yf) * (zf) +
            (thenii.data[currentIndex001] == mapval) * (xf) * (1 - yf) * (1 - zf) +
            (thenii.data[currentIndex110] == mapval) * (1 - xf) * (yf) * (zf) +
            (thenii.data[currentIndex011] == mapval) * (xf) * (1 - yf) * (zf) +
            (thenii.data[currentIndex101] == mapval) * (xf) * (yf) * (1 - zf) +
            (thenii.data[currentIndex111] == mapval) * (xf) * (yf) * (zf);
        }

        return currentVal;

    }

    function __trilinInterp_atlas(thenii, px, py, pz, A, offs, labels)
    {

        var x = NNInterp(thenii, px, py, pz, A, offs)
        var a = labels[x];
        var rgb = [0,0,0,0]
        if (a) {
             rgb[0] += a.color[0];
             rgb[1] += a.color[1];
             rgb[2] += a.color[2];
             rgb[3] += 1;
        }                    
        return rgb

    }

    function trilinInterp_atlas(thenii, px, py, pz, A, offs, labels)
    {
        function argMax(array) {
          return array.map((x, i) => [x, i]).reduce((r, a) => (a[0] > r[0] ? a : r))[1];
        }
        var tmp = {}

        function acc(idx,w)
        {
            if (w<=0)
                return;
            var a = thenii.data[idx];

            if (tmp[a] != undefined)
                tmp[a] += w;
             else
                tmp[a] = w;
        }

        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = math.floor(xs);
        var yi = math.floor(ys);
        var zi = math.floor(zs);
        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi;
        var currentVal = 0;
        var rgb = [0,0,0,0]
        if (zi < thenii.sizes[2]-1  && zi >= 0 && yi < thenii.sizes[1] - 1 && yi >= 0 && xi < thenii.sizes[0] - 1 && xi >= 0)
        {

            var index;
            index = thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + xi + offs;
            acc(index,(1 - xf) * (1 - yf) * (1 - zf))
            index =  thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + xi + offs;
            acc(index,(1 - xf) * (yf) * (1 - zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + xi + offs;
                         acc(index, (1 - xf) * (1 - yf) * (zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + (xi + 1) + offs;
                            acc(index,(xf) * (1 - yf) * (1 - zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + xi + offs;
                  acc(index, (1 - xf) * (yf) * (zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + (xi + 1) + offs;
                  acc(index,(xf) * (1 - yf) * (zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;
               acc(index,(xf) * (yf) * (1 - zf) )

            index =  thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;
            acc(index, (xf) * (yf) * (zf))

            var m  = 0;
            var z = 0;
            for (var k in tmp)
            {
                if (tmp[k]>m)
                {
                    m = tmp[k]
                    z = k
                }
            }
        
            if (m>0.5)
            {
                var a = labels[z];
                if (a) {
                     rgb[0] = a.color[0];
                     rgb[1] = a.color[1];
                     rgb[2] = a.color[2];
                     rgb[3] = 1;
                }                    
            }
          }

          return rgb;
        }


    function NNInterp_atlas(thenii, px, py, pz, offs, labels)
    {
        var rgb = [0,0,0,0]
        if (pz < thenii.sizes[2] && pz >= 0 && py < thenii.sizes[1]  && py >= 0 && px < thenii.sizes[0]  && px >= 0)
        {
            var idx = thenii.sizes[0] * thenii.sizes[1] * pz + py * thenii.sizes[0] + px + offs;
            var v = thenii.data[idx];
            var a = labels[v];

            if (a) {
                 rgb[0] = a.color[0];
                 rgb[1] = a.color[1];
                 rgb[2] = a.color[2];
                 rgb[3] = 1;
            }                    
    
        }
        return rgb;
    
    }
/*
    function __trilinInterp_atlas(thenii, px, py, pz, A, offs, labels)
    {



        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = math.floor(xs);
        var yi = math.floor(ys);
        var zi = math.floor(zs);
        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi;
        var currentVal = 0;
        if (zi < thenii.sizes[2] - 1 && zi >= 0 && yi < thenii.sizes[1] - 1 && yi >= 0 && xi < thenii.sizes[0] - 1 && xi >= 0)
        {
            var currentIndex000 = thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + xi + offs;
            var currentIndex100 = thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + xi + offs;
            var currentIndex010 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + xi + offs;
            var currentIndex001 = thenii.sizes[0] * thenii.sizes[1] * zi + yi * thenii.sizes[0] + (xi + 1) + offs;
            var currentIndex110 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + xi + offs;
            var currentIndex011 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + yi * thenii.sizes[0] + (xi + 1) + offs;
            var currentIndex101 = thenii.sizes[0] * thenii.sizes[1] * zi + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;
            var currentIndex111 = thenii.sizes[0] * thenii.sizes[1] * (zi + 1) + (yi + 1) * thenii.sizes[0] + (xi + 1) + offs;

        
            var rgb = [0,0,0,0];
            function acc(currentIndex,fac)
            {
                var a = labels[thenii.data[currentIndex]];
                if (a) {
                     rgb[0] += fac*a.color[0];
                     rgb[1] += fac*a.color[1];
                     rgb[2] += fac*a.color[2];
                     rgb[3] += fac;
                }                    
            }
            acc(currentIndex000, (1 - xf) * (1 - yf) * (1 - zf));
            acc(currentIndex100,(1 - xf) * (yf) * (1 - zf) );
            acc(currentIndex010, (1 - xf) * (1 - yf) * (zf) );
            acc(currentIndex001,(xf) * (1 - yf) * (1 - zf) );
            acc(currentIndex110, (1 - xf) * (yf) * (zf) );
            acc(currentIndex011,(xf) * (1 - yf) * (zf) );
            acc(currentIndex101,(xf) * (yf) * (1 - zf) );
            acc(currentIndex111, (xf) * (yf) * (zf) );
           

            return rgb;
        }

        return [0,0,0,0];

    }


*/
    function trilinInterp_rgbnii(thenii, px, py, pz, A, offs)
    {
        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3] ;
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3] ;
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3] ;
        
        var xi = math.floor(xs + 0.001);
        var yi = math.floor(ys + 0.001);
        var zi = math.floor(zs + 0.001);

        if (zi < thenii.sizes[2] && zi >= 0 && yi < thenii.sizes[1] && yi >= 0 && xi < thenii.sizes[0] && xi >= 0)
        {
            var ind = 3*(thenii.widhei * zi + yi * thenii.wid + xi + offs);
            var currentVal = [thenii.data[ind], thenii.data[ind+1], thenii.data[ind+2]];
            return currentVal;
        }

    }


    function trilinInterp(thenii, px, py, pz, A, offs)
    {


        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3] ;
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3] ;
        var zs = (A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3] );
     //   if (zs<0 & zs > -0.001)
       //     zs = 0;
        var xi = math.floor(xs + 0.0000001);
        var yi = math.floor(ys + 0.0000001);
        var zi = math.floor(zs + 0.0000001);

        var xf = xs - xi;
        var yf = ys - yi;
        var zf = zs - zi; 
        var currentVal = undefined;
        if (zi < thenii.sizes[2] && zi >= -1 && 
            yi < thenii.sizes[1] && yi >= -1 &&
            xi < thenii.sizes[0] && xi >= -1)
        {
            xi = (xi == -1)?0:xi
            yi = (yi == -1)?0:yi
            var xi1 = (xi == thenii.sizes[0]-1)?xi:(xi+1)
            var yi1 = (yi == thenii.sizes[1]-1)?yi:(yi+1)
            //var zi1 = (zi == thenii.sizes[2]-1)?zi:(zi+1)                
            var zi1 = zi+1;

            if (zi == -1)
            {
                if (zf < 0.5)
                    return undefined
                zi = 0;
            }
            else if (zi == thenii.sizes[2]-1)
            {
                if (zf > 0.5)
                    return undefined;
                zi1 = zi;
            }

            var currentIndex000 = (thenii.widhei * zi + yi * thenii.wid + xi) % thenii.widheidep + offs; // 000
            var currentIndex100 = (thenii.widhei * zi + yi1 * thenii.wid + xi) % thenii.widheidep + offs; // 010
            var currentIndex010 = (thenii.widhei * zi1 + yi * thenii.wid + xi) % thenii.widheidep + offs; // 001
            var currentIndex001 = (thenii.widhei * zi + yi * thenii.wid + xi1) % thenii.widheidep + offs; // 100
            var currentIndex110 = (thenii.widhei * zi1 + yi1 * thenii.wid + xi) % thenii.widheidep + offs; // 011
            var currentIndex011 = (thenii.widhei * zi1 + yi * thenii.wid + xi1) % thenii.widheidep + offs; // 101
            var currentIndex101 = (thenii.widhei * zi + yi1 * thenii.wid + xi1) % thenii.widheidep + offs;  // 110
            var currentIndex111 = (thenii.widhei * zi1 + yi1 * thenii.wid + xi1) % thenii.widheidep + offs; // 111
            var currentVal = thenii.data[currentIndex000] * (1 - xf) * (1 - yf) * (1 - zf) +  // 000
            thenii.data[currentIndex100] * (1 - xf) * (yf) * (1 - zf) +                      // 010 
            thenii.data[currentIndex010] * (1 - xf) * (1 - yf) * (zf) +                     // 001
            thenii.data[currentIndex001] * (xf) * (1 - yf) * (1 - zf) +                     // 100
            thenii.data[currentIndex110] * (1 - xf) * (yf) * (zf) +                         // 011
            thenii.data[currentIndex011] * (xf) * (1 - yf) * (zf) +                         // 101
            thenii.data[currentIndex101] * (xf) * (yf) * (1 - zf) +                         // 110
            thenii.data[currentIndex111] * (xf) * (yf) * (zf);                              // 111
        }
        else
            return undefined;

        return currentVal;

    }

    function trilinInterp3_signcorrected(thenii, px, py, pz, A, totsz,offset)
    {

        
        if (offset == undefined)
            offset = 0;

        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = math.floor(xs + 0.0000001);
        var yi = math.floor(ys + 0.0000001);
        var zi = math.floor(zs + 0.0000001);
        var xf =  xs - xi;
        var yf =  ys - yi;
        var zf =  zs - zi;
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

            var magX = math.abs(thenii.data[currentIndex000]) +
            math.abs(thenii.data[currentIndex001]) +
            math.abs(thenii.data[currentIndex010]) +
            math.abs(thenii.data[currentIndex100]) +
            math.abs(thenii.data[currentIndex110]) +
            math.abs(thenii.data[currentIndex011]) +
            math.abs(thenii.data[currentIndex101]) +
            math.abs(thenii.data[currentIndex111]);
            var magY = math.abs(thenii.data[currentIndex000 + totsz]) +
            math.abs(thenii.data[currentIndex001 + totsz]) +
            math.abs(thenii.data[currentIndex010 + totsz]) +
            math.abs(thenii.data[currentIndex100 + totsz]) +
            math.abs(thenii.data[currentIndex110 + totsz]) +
            math.abs(thenii.data[currentIndex011 + totsz]) +
            math.abs(thenii.data[currentIndex101 + totsz]) +
            math.abs(thenii.data[currentIndex111 + totsz]);
            var magZ = math.abs(thenii.data[currentIndex000 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex001 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex010 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex100 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex110 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex011 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex101 + 2 * totsz]) +
            math.abs(thenii.data[currentIndex111 + 2 * totsz]);

            var off = 0;
            if (magZ > magY && magZ > magX)
                off = 2 * totsz;
            else if (magY > magZ && magY > magX)
                off = totsz;


            var sg000 = math.sign(thenii.data[currentIndex000 + off]);
            var sg001 = math.sign(thenii.data[currentIndex001 + off]);
            var sg010 = math.sign(thenii.data[currentIndex010 + off]);
            var sg100 = math.sign(thenii.data[currentIndex100 + off]);
            var sg110 = math.sign(thenii.data[currentIndex110 + off]);
            var sg011 = math.sign(thenii.data[currentIndex011 + off]);
            var sg101 = math.sign(thenii.data[currentIndex101 + off]);
            var sg111 = math.sign(thenii.data[currentIndex111 + off]);

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


    function NNInterp3_n(thenii, px, py, pz, A, totsz,offset,n)
    {

        
        if (offset == undefined)
            offset = 0;

        var xs = A[0][0] * px + A[0][1] * py + A[0][2] * pz + A[0][3];
        var ys = A[1][0] * px + A[1][1] * py + A[1][2] * pz + A[1][3];
        var zs = A[2][0] * px + A[2][1] * py + A[2][2] * pz + A[2][3];
        var xi = Math.round(xs + 0.0000001);
        var yi = Math.round(ys + 0.0000001);
        var zi = Math.round(zs + 0.0000001);
        
        if (zi < thenii.sizes[2] && zi >= 0 && yi < thenii.sizes[1] && yi >= 0 && xi < thenii.sizes[0] && xi >= 0)
        {
            var currentVal = [];
            var currentIndex000 = (thenii.widhei * zi + yi * thenii.wid + xi) % thenii.widheidep + offset;
            for (var k = 0; k < n; k++)
                currentVal[k] =thenii.data[currentIndex000+totsz*k];

            return currentVal
        }

        return currentVal;

    }



KMedViewer.getPermutationOrder = function(id)
{
    // human (default, radiological)
    var perm = [0, 1, 2];
    var flips = [1, 1, 1];
    var fixed = false;

    var porder = state.viewer.permOrder 
    if (id != undefined)
        porder = id;
    if (porder == undefined)
        proder = 'human';
                


    if (porder != undefined)
    {
        if (porder== 'mouse')
            perm = [0, 2, 1];
        else if (porder == 'mouse_flipped')
        {
            perm = [0, 2, 1];
            flips = [-1, -1, -1];
        }
        else if (porder == 'human_flipped')
        {
            perm = [0, 1, 2];
            flips = [-1, 1, -1];
        }
        else if (porder== 'human_neuro')
        {
            perm = [0, 1, 2];
            flips = [-1, 1, 1];
        }
        else if (porder== 'sheep')
        {
            perm = [2, 0, 1];
            flips = [1, 1, -1];
        }
        else if (porder == 'fixed_heart')
        {
            perm = [0, 1, 2];
            flips = [-1, -1, 1];
            fixed = true;
        }

    }
    var mat = [[0, 0, 0,0], [0, 0, 0,0], [0, 0, 0,0],[0,0,0,1]];
    mat[0][perm[0]] = flips[0];
    mat[1][perm[1]] = flips[1];
    mat[2][perm[2]] = flips[2];
    var det = math.det(mat) ;

    var invperm = [-1,-1,-1];
    invperm[perm[0]] = 0;
    invperm[perm[1]] = 1;
    invperm[perm[2]] = 2;

/*    mat[0][perm[0]] = 1;
    mat[1][perm[1]] = 1;
    mat[2][perm[2]] = 1;
    var det = math.det(mat) * flips[0] * flips[1] * flips[2];*/
    return {
        perm: perm,
        invperm:invperm,
        flips: flips,
        det: det,
        mat:mat,
        fixed: fixed,
        id:porder
    };
}



KMedViewer.createThumbnailImage = function(nii, slicingDimOfWorld)
{

    var nii = nii || KViewer.viewports[0].medViewer.nii;
    var slicingDimOfWorld = slicingDimOfWorld || 2;


    var slicingDimOfArray = nii.permutationOrder.indexOf(slicingDimOfWorld);
    var tOffset = 0;

    var swapXY, sy, sy, xdir, ydir, xflip, yflip, sliceAspectRatio, currentSlice;

    if (slicingDimOfArray == 0) {
        swapXY = (nii.permutationOrder[1] > nii.permutationOrder[2]) ? 1 : 0;
        sx = nii.sizes[1];
        sy = nii.sizes[2];
        currentSlice = math.floor(nii.sizes[0] / 2);
        xdir = -nii.arrayReadDirection[1];
        ydir = -nii.arrayReadDirection[2];
        sliceAspectRatio = sx / sy * nii.voxSize[1] / nii.voxSize[2];
        var voxSizeX = nii.voxSize[1];
        var voxSizeY = nii.voxSize[2];

    }

    if (slicingDimOfArray == 1) {
        swapXY = (nii.permutationOrder[0] > nii.permutationOrder[2]) ? 1 : 0;
        sx = nii.sizes[0];
        sy = nii.sizes[2];
        currentSlice = math.floor(nii.sizes[1] / 2);
        xdir = -nii.arrayReadDirection[0];
        ydir = -nii.arrayReadDirection[2];
        sliceAspectRatio = sx / sy * nii.voxSize[0] / nii.voxSize[2];
        var voxSizeX = nii.voxSize[0];
        var voxSizeY = nii.voxSize[2];
    }

    if (slicingDimOfArray == 2) {
        swapXY = (nii.permutationOrder[0] > nii.permutationOrder[1]) ? 1 : 0;
        sx = nii.sizes[0];
        sy = nii.sizes[1];
        currentSlice = math.floor(nii.sizes[2] / 2);
        xdir = -nii.arrayReadDirection[0];
        ydir = -nii.arrayReadDirection[1];
        sliceAspectRatio = sx / sy * nii.voxSize[0] / nii.voxSize[1];
        var voxSizeX = nii.voxSize[0];
        var voxSizeY = nii.voxSize[1];
    }
    xflip = xdir == 1 ? 0 : 1;
    yflip = ydir == 1 ? 0 : 1;

    var width = sx;
    var height = sy;

    var scale = nii.histogram.max;
    var sliceData = new Uint8ClampedArray(width * height * 4);

    for (var x = 0; x < sx; x++)
    {
        for (var y = 0; y < sy; y++)
        {

            if (slicingDimOfArray == 0) {
                px = currentSlice;
                py = x;
                pz = y;
            }
            if (slicingDimOfArray == 1) {
                px = x;
                py = currentSlice;
                pz = y;
            }
            if (slicingDimOfArray == 2) {
                px = x;
                py = y;
                pz = currentSlice;
            }

            var k;
            if (swapXY)
                k = ((sx * xflip + xdir * (x) - xflip) * sy + yflip * sy + ydir * (y) - yflip) * 4;
            else
                k = ((sy * yflip + ydir * (y) - yflip) * sx + xflip * sx + xdir * (x) - xflip) * 4;

            var rgba = nii.data[nii.sizes[0] * nii.sizes[1] * pz + py * nii.sizes[0] + px + +tOffset] / scale * 255;
            ;
            sliceData[k + 0] = rgba;
            sliceData[k + 1] = rgba;
            sliceData[k + 2] = rgba;
            sliceData[k + 3] = 255;
        }
        //y
    }
    //x


    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    canvas.width = sx;
    canvas.height = sy * sliceAspectRatio;

    var idata = ctx.createImageData(width, height);
    idata.data.set(sliceData);
    ctx.putImageData(idata, 0, 0);
    var dataUri = canvas.toDataURL()


    var $img = $("<img />");
    // set the data uri 
    $img.attr("src", dataUri);

    //$img.get(0).style = ("position:absolute; width:200px; top:0; left: 0; height:200px; z-index:1000; border:1px solid red;")
    //$img.appendTo(document.body);
    return $img;

}









function FiberQuiver(that)
{
    var quiver = {}
    var ctx = that.$canvas.get(0).getContext("2d");

    function resetParams()
    {
        var params = default_quiver_params();
        FiberQuiver.params = params;
        ViewerSettings.quiver = params;
        return params;
    }

    function default_quiver_params()
    {
        var params = {};
        params.density = 1;
        params.type = 't';
        params.color = 0;
        params.lengthfac = 1;
        params.width = 1;
        params.sign = 0;
        params.visible = false;
        
        return params;
    }


    quiver.draw = function()
    {
        for (var k = 0;k < that.quivers.length;k++)
        //    if (that.quivers[k].parentviewbar.visible)
                quiver.draw_single(that.quivers[k]);

    }

    quiver.draw_single = function(quiver_source)
    {

        var nii = quiver_source.nii;
        if (nii.quiver_params == undefined)
            nii.quiver_params = default_quiver_params();
        quiver_source.parentviewbar.quiverdiv.css("color","")


        if (!nii.quiver_params.visible | that.mosaicview.active)
        {
            quiver.clear_this(quiver_source);
            quiver_source.parentviewbar.quiverdiv.css("color","red")
            return;
        }

        var quiver_params = nii.quiver_params;

        var slicingDimOfWorld;

        if (nii == undefined || nii.sizes[3]%3 != 0)
            return;

        
        var n = that.nii;


        var reorient = math.diag([1, 1, 1, 1]);
        if (KViewer.navigationTool.isinstance && 
               
        ((KViewer.navigationTool.movingObjs[quiver_source.parentviewbar.currentFileID] != undefined & KViewer.navigationMode == 0)| (KViewer.navigationMode == 2 & KViewer.mainViewport != -1)))
        reorient = KViewer.reorientationMatrix.matrix;
        // | (noNativeSlicing & KViewer.navigationMode == 2) ) )


/*
 
        var n = quiver_source.nii;
        var Order = KMedViewer.getPermutationOrder(); 

        var qe = math.multiply(n.edges,math.diag([1/n.voxSize[0],1/n.voxSize[1],1/n.voxSize[2],1]));
        qe = math.setTranslation(qe,[0,0,0]);

        var be = math.multiply(that.nii.edges,math.diag([1/that.nii.voxSize[0],1/that.nii.voxSize[1],1/that.nii.voxSize[2],1]));
        be = math.setTranslation(be,[0,0,0]);

        var r2 = math.multiply(math.inv(Order.mat),(math.multiply(reorient,(Order.mat))));
   
        var e1 = math.multiply(math.inv(be),(qe));
        var e2 = math.inv(permMat_noscale(that.nii));


         e2 = math.multiply(e2,e1);

        e2 =  (math.multiply(math.inv(reorient),e2));

        e2 = math.multiply(e2,math.inv(Order.mat));
*/

   /*

        var Order = KMedViewer.getPermutationOrder(); 

        var qe = math.multiply(n.edges,math.diag([1/n.voxSize[0],1/n.voxSize[1],1/n.voxSize[2],1]));
        qe = math.setTranslation(qe,[0,0,0]);

        var be = math.multiply(that.nii.edges,math.diag([1/that.nii.voxSize[0],1/that.nii.voxSize[1],1/that.nii.voxSize[2],1]));
        be = math.setTranslation(be,[0,0,0]);
        var e1 = math.multiply(math.inv(be),(qe));
        var e2 = math.inv(permMat_noscale(that.nii));
         e2 = math.multiply(e2,e1);
        e2 =  (math.multiply(math.inv(reorient),e2));

        e2 = math.multiply(Order.mat,e2);
*/
  





        var e =  math.multiply(math.inv(that.nii.edges_noscale),(math.multiply(math.inv(reorient),quiver_source.nii.edges_noscale)));
        var e2 =  math.multiply(math.inv(permMat_noscale(that.nii)),e);

        var permCol = function(q) { return q }
        if (quiver_source.parentviewbar && quiver_source.parentviewbar.showcolored_type)
        {
            var type = quiver_source.parentviewbar.showcolored_type;            
            if (type == "GBR")
               permCol = function(q) { return [q[1],q[2],q[0]] }
            if (type == "GRB")
               permCol = function(q) { return [q[0],q[2],q[1]] }
            if (type == "BRG")
               permCol = function(q) { return [q[2],q[0],q[1]] }
            
        }


        var qs = quiver_source.nii
        if (typeof qs.descrip == "string" && qs.descrip.substring(0,6).toLowerCase() == "mrtrix")
        {
            e2 = math.multiply(e2,math.multiply(math.diag([qs.voxSize[0],qs.voxSize[1],qs.voxSize[2],1]),math.inv(qs.edges)));                        
         //   e2 = math.multiply(e2,math.diag([-qs.detsign,1,1,1]));                        
          //  e2 = math.multiply(e2,math.diag([1,-1,1,1]));                        
        }



        var R = e2._data;



        var offX = 0.5 / ctx.canvas.width / that.embedfac_width;
        // 1/2 pixel correction
        var offY = 0.5 / ctx.canvas.height / that.embedfac_height;
        var cpos = that.$canvas.offset();
        cpos.top -= that.$container.offset().top;
        cpos.left -= that.$container.offset().left;
        var facX = 1 / that.$canvas.width() / that.embedfac_width;
        var facY = 1 / that.$canvas.height() / that.embedfac_height;
        var volsz = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];

        var cwid = that.$container.width();
        var chei = that.$container.height();
        var invedges = math.inv(nii.edges);
        var flines = "";


        var pos_random = 1;
        var len_random = 1.3;
        var col_random = 100;
        var opacs = [1, 0.8, 0.3];
        var stepquality = [8, 5, 3];

        if (quiver_params.type == "q")
        {
            pos_random = 0;
            len_random = 0;
            col_random = 0;
            swidth = 1.5;
            opacs = [1, 1, 1];
            stepquality = [14, 12, 10];
        }

        if (quiver_params.width == undefined)
            quiver_params.width = 1;
        if (quiver_params.gamma == undefined)
            quiver_params.gamma = 1;
        if (quiver_params.sign == undefined)
             quiver_params.sign = 0;


        var cfac = 127 / quiver_source.clim[1];

        var swidth = quiver_params.width;

        var opac = opacs[quiver_params.density];

        var step = stepquality[quiver_params.density];

        //var scfac = 0.05*that.zoomFac;
        var scfac = 4*quiver_params.lengthfac * math.sqrt(that.zoomFac) / nii.histogram.max * Math.pow(20,1-quiver_params.gamma);

        var numchunks = 40;

        var wnum = math.floor(cwid / step);
        var hnum = math.floor(chei / step);
        var numdirs = nii.sizes[3]/3;        
        var totnum = wnum * hnum *numdirs;
        var rperm = randperm(totnum);


        var interp_type;
        if (quiver_params.sign == 0)
            interp_type = 0;
        if (numdirs == 1)
            interp_type = 1;
        if (quiver_params.sign != 0)
            interp_type = 2;


        var chunksize = math.floor(totnum / numchunks);

        if (quiver_source.tsid != -1)
            clearTimeout(quiver_source.tsid);
        if (quiver_source.iid != -1)
            clearInterval(quiver_source.iid);

        if (quiver_source.$fibercont != undefined)
            quiver_source.$fibercont.remove();

        var c = colors[quiver_params.color];
        var s = [(c[0] > 128) ? -1 : 1, (c[1] > 128) ? -1 : 1, (c[2] > 128) ? -1 : 1];

        quiver_source.$fibercont = $("<div class='KFiberQuiver'> </div>").appendTo(that.$container);

        quiver_source.tsid = setTimeout(function()
        {
            quiver_source.tsid = -1;
            var f = 0;
            quiver_source.iid = setInterval(function() {
                 if (that.nii == undefined || f >= totnum || f / chunksize > numchunks)
                {
                    clearInterval(quiver_source.iid);
                    quiver_source.iid = -1;
                }
                var flines = render(f, chunksize);
                var r = math.floor(col_random * Math.random());
                if (c == "dir")
                    $("<svg  style='opacity:" + opac + ";position:absolute;stroke-width:" + swidth + "'>" + flines + "</svg>").appendTo(quiver_source.$fibercont);
                else
                    $("<svg  style='opacity:" + opac + ";position:absolute;stroke:rgb(" + (c[0] + s[0] * r) + "," + (c[1] + s[1] * r) + "," + (c[2] + s[2] * r) + ");stroke-width:" + swidth + "'>" + flines + "</svg>").appendTo(quiver_source.$fibercont);
                f += chunksize;
               
            }, 0);
        }, 50);

        function mapDirections(n)
        {

            var t  = [R[0][0]*n[0] + R[0][1]*n[1] + R[0][2]*n[2], 
                    R[1][0]*n[0] + R[1][1]*n[1] + R[1][2]*n[2] ,
                    R[2][0]*n[0] + R[2][1]*n[1] + R[2][2]*n[2] ];
               
            return t;

            if (1)   
            {
                if (slicingDimOfWorld == 0)
                    return [t[1],t[2],t[0]];
                if (slicingDimOfWorld == 1)
                    return [t[0],t[2],t[1]];
                if (slicingDimOfWorld == 2)
                    return [t[0],t[1],t[2]];

            return;
            }
            else
            {
            if (slicingDimOfWorld == 0)
            {
                return [nii.arrayReadDirection[nii.invPermOrder[1]] * n[nii.invPermOrder[1]], nii.arrayReadDirection[nii.invPermOrder[2]] * n[nii.invPermOrder[2]]];
            }
            if (slicingDimOfWorld == 1)
            {
                return [nii.arrayReadDirection[nii.invPermOrder[0]] * n[nii.invPermOrder[0]], nii.arrayReadDirection[nii.invPermOrder[2]] * n[nii.invPermOrder[2]]];
            }
            if (slicingDimOfWorld == 2)
            {
                return [nii.arrayReadDirection[nii.invPermOrder[0]] * n[nii.invPermOrder[0]], nii.arrayReadDirection[nii.invPermOrder[1]] * n[nii.invPermOrder[1]]];
            }
            }
        }


        function render(offs, size)
        {
            var flines = "";
            if (that.nii == undefined)
                return "";

            var xrand = (Math.random() - 0.5) * step * pos_random;
            var yrand = (Math.random() - 0.5) * step * pos_random;
            slicingDimOfWorld = that.getSlicingDimOfWorld();
            var slicingDimOfArray = that.getSlicingDimOfArray();
            var R = math.inv(that.getTiltMat(slicingDimOfArray));
            var EI = math.multiply(reorient, math.multiply(that.nii.edges, R));

            var c = colors[quiver_params.color];

            var pos,neg;
            if (quiver_params.sign == 0)
            {
                pos = 1;
                neg = 1;
            }
            else  if (quiver_params.sign == -1)
            {
                pos = 0;
                neg = 1;
            } 
            else if (quiver_params.sign == 1)
            {
                pos = 1;
                neg = 0;
            }


            var renderLineString;

            if (c == "dir")
                renderLineString = function(v, k, j)
                {
                    var q = mapDirections(v);
                    var n;
                    if (slicingDimOfWorld == 0)
                        n = [q[1],q[2],q[0]];
                    if (slicingDimOfWorld == 1)
                        n = [q[0],q[2],q[1]];
                    if (slicingDimOfWorld == 2)
                        n = [q[0],q[1],q[2]];
                    var q = permCol(q);

                    var rf = 1 + len_random * (Math.random() - 0.5);
//                    n[0] *= scfac*rf;
  //                  n[1] *= scfac * rf;
                    if (!isNaN(n[0]) && !isNaN(n[1]))
                        return '<line style="stroke:rgb(' + math.floor(math.abs(q[0] * cfac)+10)
                                                    + ',' + math.floor(math.abs(q[1] * cfac)+10)
                                                    + ',' + math.floor(math.abs(q[2] * cfac)+10) + ')" x1="' + (k + pos*n[0]*scfac*rf) + '" y1="' + (j + pos*n[1]*scfac*rf) + '" x2="' + (k - neg*n[0]*scfac*rf) + '" y2="' + (j - neg*n[1]*scfac*rf) + '" />';
//                        return '<line style="stroke:rgb(' + math.floor(math.abs(v[0] * cfac + 10)) + ',' + math.floor(math.abs(v[1] * cfac + 10)) + ',' + math.floor(math.abs(v[2] * cfac + 10)) + ')" x1="' + (k + pos*n[0]) + '" y1="' + (j + pos*n[1]) + '" x2="' + (k - neg*n[0]) + '" y2="' + (j - neg*n[1]) + '" />';
                }
            else
                renderLineString = function(v, k, j)
                {
                    var n = mapDirections(v);
                    if (slicingDimOfWorld == 0)
                        n = [n[1],n[2],n[0]];
                    if (slicingDimOfWorld == 1)
                        n = [n[0],n[2],n[1]];
                    if (slicingDimOfWorld == 2)
                        n = [n[0],n[1],n[2]];

                    var rf = 1 + len_random * (Math.random() - 0.5);
                    n[0] *= scfac * rf;
                    n[1] *= scfac * rf;
                    if (!isNaN(n[0]) && !isNaN(n[1]))
                        return '<line x1="' + (k + pos*n[0]) + '" y1="' + (j + pos*n[1]) + '" x2="' + (k - neg*n[0]) + '" y2="' + (j - neg*n[1]) + '" />';
/*
                    var n = mapDirections(v);
                    var rf = scfac*(1 + len_random * (Math.random() - 0.5));
                    n[0] *= rf;
                    n[1] *= rf;
                    var r_ = (Math.random()-0.5)*0;
                    var p_ = pos*(1+r_);
                    var n_ = neg*(1-r_);

                    if (!isNaN(n[0]) && !isNaN(n[1]))
                        return '<line x1="' + (k + p_*n[0]) + '" y1="' + (j + p_*n[1]) + '" x2="' + (k - n_*n[0]) + '" y2="' + (j - n_*n[1]) + '" />';
  */                      
                }



            var voxelCoordinates = that.getCurrenVoxel()._data.slice(0);
            var te_ = that.nii.edges._data;
            if (KViewer.mainViewport !== -1)
                te_ = EI._data;


            var offsetT = 0;
            if (nii.currentTimePoint && nii.currentTimePoint.t)
                offsetT = nii.currentTimePoint.t*3;
                
            
            for (var i = offs; i < size + offs && i < totnum; i++)
            {
                var ir = rperm[i];
                var k = (ir % wnum                 ) * step + xrand;
                var j = (math.floor(ir / wnum) %hnum      ) * step +yrand;
                var ndir = (math.floor(ir / (wnum*hnum)));

                var X = k - cpos.left;
                // position on canvas
                var Y = j - cpos.top;
                // position on canvas
                var x_norm = X * facX;
                // must add one half pixel
                var y_norm = Y * facY;

                if (that.swapXY)
                {
                    var tmp = x_norm;
                    x_norm = y_norm;
                    y_norm = tmp;
                }

                var pi;
                if (slicingDimOfArray == 0)
                    pi = [1, 2, 0];
                else if (slicingDimOfArray == 1)
                    pi = [0, 2, 1];
                else
                    pi = [0, 1, 2];

                if (x_norm)
                    voxelCoordinates[pi[0]] = (that.nii.arrayReadDirection[pi[0]] == 1) ? ((1 - x_norm - offX) * that.nii.sizes[pi[0]]) : ((x_norm - offX) * that.nii.sizes[pi[0]]);
                if (y_norm)
                    voxelCoordinates[pi[1]] = (that.nii.arrayReadDirection[pi[1]] == 1) ? ((1 - y_norm - offY) * that.nii.sizes[pi[1]]) : ((y_norm - offY) * that.nii.sizes[pi[1]]);

                var realWorldCoordinates;
                realWorldCoordinates =  [ te_[0][0]*voxelCoordinates[0] + te_[0][1]*voxelCoordinates[1] + te_[0][2]*voxelCoordinates[2] + te_[0][3],
                                              te_[1][0]*voxelCoordinates[0] + te_[1][1]*voxelCoordinates[1] + te_[1][2]*voxelCoordinates[2] + te_[1][3],
                                              te_[2][0]*voxelCoordinates[0] + te_[2][1]*voxelCoordinates[1] + te_[2][2]*voxelCoordinates[2] + te_[2][3],1];



                var point = realWorldCoordinates;
                var v;
                if (interp_type == 0)
                   v = NNInterp3_n(nii, point[0], point[1], point[2], invedges._data, volsz,ndir*(volsz*3+offsetT),3);
                else if (interp_type == 1)
                   v = trilinInterp3_signcorrected(nii , point[0], point[1], point[2], invedges._data,volsz,volsz*offsetT); 
                else 
                   v = [trilinInterp(nii, point[0], point[1], point[2], invedges._data, volsz*(0+offsetT)),
                         trilinInterp(nii, point[0], point[1], point[2], invedges._data, volsz*(1+offsetT)),
                         trilinInterp(nii, point[0], point[1], point[2], invedges._data, volsz*(2+offsetT))];
                if (v)
                {
                    if (quiver_params.gamma != 1)
                    {
                        var norm = Math.pow(v[0]*v[0]+v[1]*v[1]+v[2]*v[2],-1/2+quiver_params.gamma/2)*(quiver_params.gamma);
                        v[0] *= norm; v[1] *= norm; v[2] *= norm;
                    }
                    flines += renderLineString(v, k, j);
                }

            }
            return flines;

        }

    }



     quiver.menu = function(event,obj) {
       KContextMenu(
       function(e) {

        var quiver_params;
        if (obj.niiOriginal != undefined)
            quiver_params = obj.niiOriginal.quiver_params;            
        else
            quiver_params = obj.nii.quiver_params;
            
        var $menu = $("<ul class='menu_context small'>");

        $menu.append($("<hr width='100%'> "));
        $menu.append($("<span> &nbsp Quiver</span>"));
        $menu.append($("<hr width='100%'> "));
        if (quiver_params.visible)
        {
            $menu.append($("<li onchoice='hide'>  hide  </li>"));
            $menu.append($("<li onchoice='color'>  Color </li>"));
            $menu.append($("<li onchoice='reset'>  reset  </li>"));

            var name = ['low', 'medium', 'high'];
            $menu.append($("<hr width='100%'> "));
            $menu.append($("<span> &nbsp Density</span>"));
            $menu.append($("<hr width='100%'> "));

            for (var k = 0; k < 3; k++)
            {
                var sel = "";
                if (quiver_params.density == k)
                    sel = 'dot-';

                $menu.append($("<li  onchoice='dens_" + k + "' > " + name[k] + "  <i  onchoice='vis_" + k + "' class='fa fa-" + sel + "circle-o'></i> </li>"));
            }
            $menu.append($("<hr width='100%'> "));
            $menu.append($("<span> &nbsp Type </span>"));
            $menu.append($("<hr width='100%'> "));
            $menu.append($("<li  onchoice='type_q' > quiver  <i  onchoice='type_q' class='fa fa-" + ((quiver_params.type == 'q') ? "dot-" : "") + "circle-o'></i> </li>"));
            $menu.append($("<li  onchoice='type_t' > texture  <i  onchoice='type_t' class='fa fa-" + ((quiver_params.type == 't') ? "dot-" : "") + "circle-o'></i> </li>"));
            $menu.append($("<hr width='100%'> "));


            if (quiver_params.lengthfac == undefined)
                quiver_params.lengthfac = 1;
            var $lengthfac = $("<input onchoice='preventSelection' type='number' step='0.1' min='0' max='100'>").val(quiver_params.lengthfac).
                 on('change', function(ev) {
                    var $input = $(ev.target);
                    quiver_params.lengthfac = parseFloat($input.val());
                    signalhandler.send('drawQuiver');               
               });
             $menu.append($("<li  onchoice='preventSelection'> Length: </li>").append($lengthfac));
        
            if (quiver_params.width == undefined)
                quiver_params.width = 1;
            var $width = $("<input onchoice='preventSelection' type='number' step='0.1' min='0.1' max='10'>").val(quiver_params.width).
                 on('change', function(ev) {
                    var $input = $(ev.target);
                    quiver_params.width = parseFloat($input.val());
                    signalhandler.send('drawQuiver');               
               });
            $menu.append($("<li  onchoice='preventSelection'> Width: </li>").append($width));
            var $gamma = $("<input onchoice='preventSelection' type='number' step='0.1' min='0' max='2'>").val(quiver_params.gamma).
                 on('change', function(ev) {
                    var $input = $(ev.target);
                    quiver_params.gamma = parseFloat($input.val());
                    signalhandler.send('drawQuiver');               
               });
            $menu.append($("<li  onchoice='preventSelection'> Gamma: </li>").append($gamma));
            
            $menu.append($("<hr width='100%'> "));

	        var signed = ['positive','no','negative'];
            $menu.append($("<li  onchoice='sign' > signed ("+signed[ quiver_params.sign+1]+") </li>"));
			



        }
        else
            $menu.append($("<li onchoice='show'>  show  </li>"));


        return $menu;
    },
    function(str, ev)
    {
        if (str == undefined)
            return;
        var quiver_params;
        if (obj.niiOriginal != undefined)
            quiver_params = obj.niiOriginal.quiver_params;            
        else
            quiver_params = obj.nii.quiver_params;
            
        if (str.substr(0, 5) == 'dens_')
        {
            quiver_params.density = str.substr(5);
            signalhandler.send('drawQuiver');
        }
        else if (str.substr(0, 5) == 'type_')
        {
            quiver_params.type = str.substr(5);
            signalhandler.send('drawQuiver');
        }
        else if (str == 'reset')
        {
            quiver_params = $.extend(quiver_params,default_quiver_params());
            signalhandler.send('drawQuiver');
        }
        else if (str == 'show')
        {
            quiver_params.visible = true;
            signalhandler.send('drawQuiver');
        }
        else if (str == 'hide')
        {
            quiver_params.visible = false;
            signalhandler.send('drawQuiver');
        }
        else if (str == 'sign')
        {
            quiver_params.sign = (quiver_params.sign+2)%3-1;
            signalhandler.send('drawQuiver');
        }
        else
        {


            var $colselector = KColorSelector(colors, colencode,
            function() {
                signalhandler.send('drawQuiver');
            }, quiver_params  );
            $colselector.addClass('KColorMenuItem');

            $colselector.themenu(ev);
        }


    })(event);  }


    quiver.clear = function()
    {
       // if (quiver.$fibercont != undefined)
       //     quiver.$fibercont.remove();

        for (var k = 0;k < that.quivers.length;k++)
        {
            if (that.quivers[k].iid != -1)
            {
                clearInterval(that.quivers[k].iid);
                that.quivers[k].iid = -1;
            }
            if (that.quivers[k].$fibercont != undefined)
              that.quivers[k].$fibercont.remove();
        }
    }

    quiver.clear_this = function(quiver_source)
    {
        if (quiver_source.$fibercont != undefined)
            quiver_source.$fibercont.remove();

        if (quiver_source.iid != -1)
        {
            clearInterval(quiver_source.iid);
            quiver_source.iid = -1;
        }
    }

    var colors = ["dir", [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [0, 0, 0], [255, 255, 255]];

    function colencode(c) {
        return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
    }

    signalhandler.attach('drawQuiver', quiver.draw);


    return quiver;
}


    ovlcnt = 0;


function KMosaicView(that)
{
    var mosaic = {};

    mosaic = {
        active: false,
        nx: 8,
        nx_cont: 8,
        zoom: 1,
        border: 0.2,
        start: 0.2,
        end: 0.8,
        clipratio: [0,0,1,1],
        mosaic_direction: false,
    };
    mosaic.active = (that.viewport.viewPortID > 14 && that.viewport.viewPortID < 18) ? true : false;
    mosaic.$sliderdiv = $("<div class='mosaicbar'></div>")
    mosaic.$window = $("<div class='mosaicslider'></div>").appendTo(mosaic.$sliderdiv);
    mosaic.$leftdrag = $("<div class='mosaicdragleft'></div>").appendTo(mosaic.$window);
    mosaic.$rightdrag = $("<div class='mosaicdragright'></div>").appendTo(mosaic.$window);

    function reset()
        {
            mosaic.clipratio = [0,0,1,1]
            mosaic.clipratio.mosaic = true;
        }
    mosaic.reset = reset;
    reset();
    
    
    function crop(v, l, u)
    {
        v = (v > u) ? u : v;
        v = (v < l) ? l : v;
        return v;
    }

    function setZWindowing()
    {
        mosaic.$window.css('left', mosaic.start * 100 + '%');
        mosaic.$window.css('width', (mosaic.end - mosaic.start) * 100 + '%');
    }

    // 
    mosaic.showControls = function()
    {
        if (!KViewer.areControlsVisible())
            return;        
        that.layoutbar.$moszoomin.show();
        that.layoutbar.$moszoomout.show();
        that.mosaicview.$sliderdiv.show()
        //that.layoutbar.$slideslices.hide();
    }
    mosaic.hideControls = function()
    {
        that.layoutbar.$moszoomin.hide();
        that.layoutbar.$moszoomout.hide();
        that.mosaicview.$sliderdiv.hide();
        that.$topRow.find(".mosaiclabels").remove();
        //that.layoutbar.$slideslices.show();
    }


    setZWindowing();

    signalhandler.attach("mosaic_changelayout",function(ev)
    {
        mosaic.start = ev.start;
        mosaic.end = ev.end;
        mosaic.nx = ev.nx;
        mosaic.ny = ev.ny;
        mosaic.zoom = ev.zoom;
        that.setInnerLayout();
        that.drawHairCross();
    })

    mosaic.$window.on("mousedown", function(e)
    {
        var mos = mosaic;
        var wid = mos.$sliderdiv.width();
        var ini_start = mos.start;
        var ini_end = mos.end;
        $(document.body).on("mouseup mouseleave", function(em) {
            if (KViewer.mainViewport != -1)
                signalhandler.send("mosaic_changelayout",mos);
            else
            { 
                that.setInnerLayout();
                that.drawHairCross();
            }
            $(document.body).off("mouseup mouseleave mousemove");
        });
        $(document.body).on("mousemove", function(em)
        {
            var delta = (em.clientX - e.clientX) / wid;
            mos.start = crop(ini_start + delta, 0, 1);
            mos.end = crop(ini_end + delta, 0, 1);
            setZWindowing();
        });
    });


    mosaic.$leftdrag.on("mousedown", function(e)
    {
        var mos = mosaic;
        var wid = mos.$sliderdiv.width();
        var ini = mos.start;
        e.preventDefault();
        e.stopPropagation();
        $(document.body).on("mouseup mouseleave", function(em) {
            if (KViewer.mainViewport != -1)
                signalhandler.send("mosaic_changelayout",mos);
            else
            { 
                that.setInnerLayout();
                that.drawHairCross();
            }          
            $(document.body).off("mouseup mouseleave mousemove");
        });
        $(document.body).on("mousemove", function(em)
        {
            var delta = (em.clientX - e.clientX) / wid;
            mos.start = crop(ini + delta, 0, 1);
            setZWindowing();
        });
    });

    mosaic.$rightdrag.on("mousedown", function(e)
    {
        var mos = mosaic;
        var wid = mos.$sliderdiv.width();
        var ini = mos.end;
        e.preventDefault();
        e.stopPropagation();
        $(document.body).on("mouseup mouseleave", function(em) {
            if (KViewer.mainViewport != -1)
                signalhandler.send("mosaic_changelayout",mos);
            else
            { 
                that.setInnerLayout();
                that.drawHairCross();
            }                      $(document.body).off("mouseup mouseleave mousemove");
        });
        $(document.body).on("mousemove", function(em)
        {
            var delta = (em.clientX - e.clientX) / wid;
            mos.end = crop(ini + delta, 0, 1);
            setZWindowing();
        });
    });

    return mosaic;

}




function KHaircross()
{
    var line = {}

    line.$main = $("<div class = 'haircross_new'></div>").appendTo(KViewer.viewports[0].$container);

    line.$centerline = $("<div class = 'centerline rotator'></div>").appendTo(line.$main );
    line.$rot1 = $("<div class = 'grabberbg rotator'><div class=''></div><i class='fa fa-rotate-left'></i></div>").appendTo(line.$main );
    line.$rot1i = line.$rot1.find('i');
    line.$rot2 = $("<div class = 'grabberbg rotator'><div class=''></div><i class='fa fa-rotate-left'></i></div>").appendTo(line.$main );
    line.$rot2i = line.$rot2.find('i');

    line.setsizes = function(siz)
    {
        siz = math.round(siz/2/3);
        line.$rot1.css({top: siz*0.5 - 1 + "px" });
        line.$rot2.css({bottom: siz*0.5 - 1 + "px"});
    }


    line.hideRot = function()
    {
            line.$rot2.hide(); 
            line.$rot1.hide();
            line.$rot2i.hide(); 
            line.$rot1i.hide();
    }

    line.showRot = function()
    {
            line.$rot2.show(); 
            line.$rot1.show();
            line.$rot2i.show(); 
            line.$rot1i.show();
    }


    line.toggleControls = function(state)
    {
        if(!state)
        {
            line.$rot2.hide(); 
            line.$rot1.hide();
        }
        else
        {
            line.$rot2.show(); 
            line.$rot1.show();
        }

    }
    return line;
    

}


function Outlines(that,atlas_label)
{
     var outlines = {};     
     outlines.gen2DContour = function(viewer)  
     {
        var ras = false;
        
        var sg = 1;
        if (ras)
            sg = -1;


        var conts = that.contour.content.Contours[that.select].ContourSequence.node    


        var e;
        if (0) //KViewer.mainViewport !== -1)
        {
            var e = viewer.nii.edges;
            e = math.multiply(KViewer.reorientationMatrix.matrix, e);
            e = math.inv(e)._data;
        }
        else
            e = math.inv(viewer.nii.edges)._data;

            
        var sz = viewer.nii.sizes;

        var wp = viewer.getWorldPosition()._data
        wp = math.multiply(math.inv(KViewer.reorientationMatrix.matrix) ,wp)._data;
        var s = viewer.getSlicingDimOfWorld()
        var pos = wp[s];

        var min = 9999.0;
        var idx = -1;
        for (var k = 0;k < conts.length;k++)
        {
            var d = math.abs(conts[k].ContourData[s]-pos)
            if (d < 3 && d < min)
            {
                idx = k;
                min = d;
            }

        }
        if (idx == -1)
        {
            outlines.close();
            return;
        }

        var c = conts[idx].ContourData;
        var verts = [];
        var lines = [];
        
        var d ;
        if (s==0) { if (viewer.swapXY)  d = [2,1];  else  d = [1,2]; }
        if (s==1) { if (viewer.swapXY)  d = [2,0];  else  d = [0,2]; }
        if (s==2) { if (viewer.swapXY)  d = [1,0];  else  d = [0,1]; }

        var rdirs = [viewer.nii.arrayReadDirection[d[0]],viewer.nii.arrayReadDirection[d[1]]]

        var pushC = function(p) { 
                    var x = (p[d[0]]+0.5)/sz[d[0]];
                    var y = (p[d[1]]+0.5)/sz[d[1]];
                    if (rdirs[0] > 0) verts.push(1-x)
                    else               verts.push(x )
                    if (rdirs[1] > 0) verts.push(1-y)
                    else               verts.push(y)
           }

        var nverts = c.length/3

        for (var k = 0; k < nverts;k++)        
        {
            var p = [ sg*e[0][0]*c[3*k] + sg*e[0][1]*c[3*k+1] + e[0][2]*c[3*k+2] + e[0][3] ,
                      sg*e[1][0]*c[3*k] + sg*e[1][1]*c[3*k+1] + e[1][2]*c[3*k+2] + e[1][3],
                      sg*e[2][0]*c[3*k] + sg*e[2][1]*c[3*k+1] + e[2][2]*c[3*k+2] + e[2][3]     ];

            pushC(p)

            lines.push(k)
            lines.push((k+1)%nverts)

        }

        return {lines:lines,verts:verts};


     }

     outlines.compOutline = function(viewer,simulateAtlas)  
     {
             if (viewer == undefined)
                viewer = that;

            var clipbox = viewer.getClipBox();

            var nii = that.nii;

            var slicingDimOfArray = viewer.getSlicingDimOfArray()
            var curSl = Math.round(viewer.getCurrentSlice());

            var data = nii.data;
            var sizes = viewer.nii.sizes;
            var vsz = viewer.nii.voxSize;
            var label = nii.label;

            var w = sizes[0];
            var h = sizes[1];
            var d = sizes[2];
            var wh = sizes[0]*sizes[1];


            var cnt = 0;
            var vertsIDX = {};
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
            var lines = [];

            var addLine = function( i0,i1)
                    {
                        lines.push(i0,i1)
                    }

            var label,thres;
            if (atlas_label != undefined)
            {                
              label = atlas_label.key;
            }
            else if (that.atlas != undefined && that.atlas.content != undefined)
            {              
               if (that.atlas.currentLabel)
                  label = that.atlas.currentLabel.key;
            }
            else
            {
               if (that.histoManager)
                    thres =that.histoManager.clim[0];
               else
                    thres = 0.5;
            }
            var compfun = function(x) { return x>thres }
            var negcompfun = function(x) { return x==undefined | x<=thres }
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
                        //return x==label;
                        return x>0.5;
                    }
                    negcompfun = function(x) {
                        //return x!=label;
                        return x <=0.5;
                    }
                }
            }

        var idxfun,subst;
        var lims;
        var pi;
        var voxsz;

        if (slicingDimOfArray == 0)
            {
                idxfun = function (a,b) { return curSl + a*w + b * wh };
                subst = function(f) { return function(a,b) { return  f(curSl,a,b) }     };                
                lims = [sizes[1],sizes[2]];
                voxsz = [vsz[1],vsz[2]]
                pi = [1,2]
            }
        else if (slicingDimOfArray == 1)
            {
                idxfun = function (a,b) { return a + curSl*w + b * wh };
                subst = function(f) { return function(a,b) { return  f(a,curSl,b) }     };
                lims = [sizes[0],sizes[2]];
                voxsz = [vsz[0],vsz[2]]
                pi = [0,2]
            }
        else if (slicingDimOfArray == 2)
            {
                idxfun = function (a,b) { return a + (b)*w + curSl * wh };
                subst = function(f) { return function(a,b) { return  f(a,b,curSl) }     };
                lims = [sizes[0],sizes[1]];
                voxsz = [vsz[0],vsz[1]]
                pi = [0,1]                
            }

        var start = [];
        var end = [];
        var cr = clipbox;
        var arrayReadDirection = viewer.nii.arrayReadDirection;
        if (viewer.swapXY)
            cr = [clipbox[1],clipbox[0],clipbox[3],clipbox[2]];



        if (arrayReadDirection[pi[0]]>0)
        {
            start[0] = Math.floor(lims[0] * (1-cr[2]));
            end[0] = Math.floor(lims[0] * (1-cr[0]));
        }
        else
        {
            start[0] = Math.floor(lims[0] * cr[0]);
            end[0] = Math.floor(lims[0] * cr[2]);
        }

        if (arrayReadDirection[pi[1]]>0)
        {
            start[1] = Math.floor(lims[1]* (1-cr[3]));
            end[1]= Math.floor(lims[1] * (1-cr[1]));
        }
        else
        {
            start[1] = Math.floor(lims[1]* (cr[1]));
            end[1] = Math.floor(lims[1]* (cr[3]));
        }




        var flip;
        var unflip;
        if (viewer.swapXY)
        {
             flip = function(x,y){
                    x = x/lims[0]; y = y/lims[1];
                    x = (arrayReadDirection[pi[0]]<0)?x:(1-x);
                    y = (arrayReadDirection[pi[1]]<0)?y:(1-y);
                    return [y,x];
                }
             unflip = function(y,x){
                    x = (arrayReadDirection[pi[0]]<0)?x:(1-x);
                    y = (arrayReadDirection[pi[1]]<0)?y:(1-y);
                    x = x*lims[0]; y = y*lims[1];
                    return [x,y]               
                }
        }
        else
        {
             flip = function(x,y){
                    x = x/lims[0]; y = y/lims[1];
                    x = (arrayReadDirection[pi[0]]<0)?x:(1-x);
                    y = (arrayReadDirection[pi[1]]<0)?y:(1-y);
                    return [x,y];
                }
             unflip = function(x,y){
                    x = (arrayReadDirection[pi[0]]<0)?x:(1-x);
                    y = (arrayReadDirection[pi[1]]<0)?y:(1-y);
                    x = x*lims[0]; y = y*lims[1];
                    return [x,y];
                }
        }
        var getPixel;




        var tOffset = 0;
        if (nii.currentTimePoint)
        {
            tOffset = nii.currentTimePoint.t * nii.sizes[0]* nii.sizes[1]* nii.sizes[2];
        }

        var ismoving = false;
        if (KViewer.navigationTool && KViewer.navigationTool.movingObjs)
        {
             ismoving = KViewer.navigationTool.movingObjs[viewer.currentFileID] != undefined;
             if (that.roi)
                ismoving = ismoving | (KViewer.navigationTool.movingObjs[that.roi.fileID]!=undefined)
        }


        if (!that.atlas && sameGeometry(viewer.nii,that.nii) && KViewer.mainViewport == -1 && !ismoving)
//        if (!that.atlas && 
 //            viewer.nii.edges._data.toString() == that.nii.edges._data.toString() &&
 //            KViewer.mainViewport == -1 && (that.A_isIdentity | that.A_isIdentity==undefined))
            getPixel = function(x,y) { return data[ idxfun(x,y) + tOffset] }        
        else
        {

            if (that.atlas)
            {
                var defield = undefined;

                if (KViewer.atlasTool.defField != undefined)
                {
                    defield = KViewer.atlasTool.defField.content

                }
                else if (KViewer.navigationTool.isinstance && 
                    (( KViewer.navigationTool.movingObjs[that.atlas.fileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ) )
                {
                    if (KViewer.reorientationMatrix.deffield)
                    {
                        defield = KViewer.reorientationMatrix.deffield
                    }
                }

                if (simulateAtlas)
                {
                   var getPixel3d =  KAtlasTool.updateGetPixelFun(that.atlas.content,viewer.nii,undefined,math.diag([1,1,1,1]),defield);
    //                var A = that.atlas.content.A;
      //              var getPixel3d = function(x,y,z) { return  NNInterp(that.nii, x, y, z, A, tOffset); }
                    getPixel = subst(getPixel3d);

                }
                else 
                {
                    if (KViewer.mainViewport==-1)
                       var getPixel3d = KAtlasTool.updateGetPixelFun(that.atlas.content,viewer.nii,parseInt(label),undefined,defield);
                    else
                      var getPixel3d = KAtlasTool.updateGetPixelFun(that.atlas.content,viewer.nii,parseInt(label),math.diag([1,1,1,1]),defield);
                    getPixel = subst(getPixel3d);
                }
            }
            else
            {
                if (that.mapCoords)
                {
                    var getPixel3d = function(x,y,z) { 
                        var ps = that.mapCoords(x,y,z);
                        return  trilinInterp(that.nii,ps[0], ps[1], ps[2], that.A, tOffset); 
                        }
                }
                else
                {
                    if (that.A == undefined)
                    {
                        that.A = math.diag([1,1,1,1])._data;
                        console.warn("where is this coming from??")
                    }
                    var getPixel3d = function(x,y,z) { return  trilinInterp(that.nii, x, y, z, that.A, tOffset); }                    
                }
                getPixel = subst(getPixel3d);
            }
        }

        outlines.getPixelSVGcoord = function(x,y)
        {
            var a = unflip(x,y)
            return getPixel(Math.round(a[0]),Math.round(a[1]));
        }


        if (simulateAtlas)
        {
            var labels = {};
            for (var y = start[1]+1; y < end[1]-1;y++)
            for (var x = start[0]+1; x < end[0]-1;x++)
            {
                var idx2 = x+lims[0]*y;
                labels[getPixel(x,y)] = 1;
            }
            return labels;
        }

        var deltax = viewer.subsample_factor_x;
        var deltay = viewer.subsample_factor_y;
        var wid = lims[0]
        var wid_deltay = wid*deltay;
        var totpixel = 0;
        for (var y = start[1]+deltay; y < end[1]-deltay;y+=deltay)
        for (var x = start[0]+deltax; x < end[0]-deltax;x+=deltax)
        {
            var idx2 = x+wid*y;
            if (compfun(getPixel(x,y)))
            {
                totpixel++;
                var i0,i1;
                if (negcompfun(getPixel(x-deltax,y)) )
                {
                    i0 = addVert(idx2);
                    i1 = addVert(idx2+wid_deltay);
                    addLine(i0,i1);
                } 

                if (negcompfun(getPixel(x+deltax,y) ))
                {
                    i0 = addVert(idx2+deltax);
                    i1 = addVert(idx2+deltax+wid_deltay);
                    addLine(i0,i1);
                }

                if (negcompfun(getPixel(x,y-deltay)) )
                {
                    i0 = addVert(idx2);
                    i1 = addVert(idx2+deltax);
                    addLine(i0,i1);			    
                } 
                if (negcompfun(getPixel(x,y+deltay)) )
                {
                    i0 = addVert(idx2+wid_deltay);
                    i1 = addVert(idx2+deltax+wid_deltay);
                    addLine(i0,i1);			    
                }
            }

        }


        var pts = Object.keys(vertsIDX);
        var verts = new Float32Array(pts.length*2);
        for (var k = 0; k < pts.length;k++)
        {
            var p = flip(pts[k]%wid -deltax+1, math.floor(pts[k]/wid)-deltay+1 );
            var i = vertsIDX[pts[k]];
            verts[2*i] = p[0];
            verts[2*i+1] = p[1];
        }


        
        if (state.viewer.smoothedOutline==undefined | state.viewer.smoothedOutline==true | !nii.isROI)
        {
            smooth();
            smooth();
        }

        function smooth()
        {
            var cnt = new Float32Array(pts.length);
            var verts2 = new Float32Array(2*pts.length);
            verts2.set(verts);
            for (var k = 0 ; k < lines.length/2;k++)
            {
                  var p1_x = verts[2*lines[2*k]];
                  var p1_y = verts[2*lines[2*k]+1];
                  var p2_x = verts[2*lines[2*k+1]];
                  var p2_y = verts[2*lines[2*k+1]+1];
                  verts2[2*lines[2*k]] += p2_x;
                  verts2[2*lines[2*k]+1] += p2_y;
                  verts2[2*lines[2*k+1]] += p1_x;
                  verts2[2*lines[2*k+1]+1] += p1_y;
                  cnt[lines[2*k]]++
                  cnt[lines[2*k+1]]++
            }
            for (var k=0;k < pts.length;k++)
            {
                verts[2*k] = verts2[2*k]/(1+cnt[k]);
                verts[2*k+1] = verts2[2*k+1]/(1+cnt[k]);
            }
        }



        return {lines:lines,verts:verts,area:totpixel*voxsz[0]*voxsz[1]};








     }

     outlines.close = function()
     {
          if (outlines.$lines != undefined)
          {
                outlines.$lines.remove();
                outlines.$label.remove();
                outlines.$lines = undefined;
          }
     }
     
     outlines.update= function(viewer)   
     {
        if (that.nii != undefined)
            outlines.current = outlines.compOutline(viewer);
        else if (that.contour != undefined)
            outlines.current = outlines.gen2DContour(viewer);

        outlines.draw(viewer);
     }

     outlines.draw = function(viewer)   
     {
         if (viewer == undefined)
            viewer = that;
         if (outlines.current != undefined)
         {
             var l = outlines.current 
             if (l.lines.length == 0)
             {
                 if (outlines.$lines != undefined)
                 {
                     var path = outlines.$lines.find("path");
                     path.attr("d","")
                     var text = outlines.$label
                     text.text("")   
                 }
                return;
             }
             var pstr = "";
             var fac_x = viewer.$canvas.width() * viewer.embedfac_width;
             var fac_y = viewer.$canvas.height() * viewer.embedfac_height;

             var color; 

             if (atlas_label != undefined)
                 color = atlas_label.color
             else  if (that.atlas != undefined)
             {
                 if (that.atlas.currentLabel != undefined)
                     color = that.atlas.currentLabel.color;
             }
             else if (that.color != undefined && that.color.constructor.name == "KColor") 
                color = [that.color.color[0],that.color.color[1],that.color.color[2]];
             else if (Array.isArray(that.color))
                color = [that.color[0],that.color[1],that.color[2]];
             else if(that.color !=undefined)
                color = KColor.list[that.color];

             var bright_color;
             if (color != undefined &&  that.type != 'overlay')
             {
                 bright_color = color.map((x) => x+100);
                 bright_color = "rgba("+ bright_color.join(',') + "," + "1)"; 
                 color = "rgba("+ color.join(',') + "," + "1)"; 

             }
             else
             {
                if (that.type == "overlay" && color != undefined)
                {
                    color = "rgba("+ color.join(',') + "," + "1)";                   
                    bright_color = color;
                }
                else
                {
                    color = "rgba(255,0,0,1)"; 
                    bright_color = "rgba(255,255,255,1)";                     
                }
             }

             var text_label = undefined;
             if (atlas_label != undefined & !outlines.no_labels)
             {
                 text_label = atlas_label.name
                 text_label = text_label.replace(/right/i,"")
                 text_label = text_label.replace(/left/i,"")
             }
             else if (state.viewer.showArea & !that.atlas)
                 text_label = (l.area.toFixed(1) + "mm²");
             else if (state.viewer.showAreaOutlinesOverlay & that.type == 'overlay')
             {
              
                 text_label = (l.area.toFixed(1) + "mm²");
             }

             var l_x = [];
             var l_y = [];
             var ll = [];
             for (var k = 0 ; k < l.lines.length/2;k++)
             {
                  var p1_x = l.verts[2*l.lines[2*k]]*fac_x;
                  var p1_y = l.verts[2*l.lines[2*k]+1]*fac_y;
                  var p2_x = l.verts[2*l.lines[2*k+1]]*fac_x;
                  var p2_y = l.verts[2*l.lines[2*k+1]+1]*fac_y;
                  pstr += "M "+ p1_x + " " + p1_y + " L " + p2_x + " " + p2_y + " ";
                  l_x.push(p1_x);
                  l_y.push(p1_y);
                  ll.push(p1_x)
                  ll.push(p1_y)
             }
             avg_x = median(l_x)
             avg_y = median(l_y)

             // hmm this not the right solution, but w/h of canvas does not match
             var w = 1000000; viewer.$canvascontainer.width();
             var h = 1000000; viewer.$canvascontainer.height();


             if (outlines.$lines == undefined)
             {
              
                 outlines.$lines =  $("<svg  style='pointer-events:none;width:"+w+"px;height:"+h+"px;z-index:1;position:absolute;stroke-width:2px'> " +                             
                            "<path style='fill:none;stroke:red;stroke-width:2' /> "+
                        //    "<text class='atlas_labels_svg'></text>" +
                            " </svg>");                        
                 viewer.$canvascontainer.append( outlines.$lines);
                 outlines.$label = $("<span class='outline_label'> </span");
                 viewer.$canvascontainer.append( outlines.$label);
                 
             }

             var path = outlines.$lines.find("path");
             path.attr("d",pstr)
             path.css('stroke',color);


             var text = outlines.$label
             text.text("")   

             if (text_label != undefined)
             {
                 var isin =  outlines.getPixelSVGcoord(avg_x/fac_x, avg_y/fac_y)
                 if (!isin)
                 {
                    var p = PolyK.ClosestPoint(ll,avg_x,avg_y);                    
                    avg_x = p.x;
                    avg_y = p.y;
                 }
                 text.css("top",avg_y)
                 text.css("left",avg_x)
                 text.css("color",bright_color)
                 text.text(text_label);              
             }




         }
     }


     
     return outlines;

}

var median = arr => {
  const mid = Math.floor(arr.length * 1/2),
    nums = [...arr].sort((a, b) => a - b);
  return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};






function create3DViewPort(edges,sz,voxsz,nii,id,$toggle,fileID)
{

    KViewer.viewports[id] = function()
    { 
      var that = {};
      that.getCurrentViewer = function() { return that };
      that.viewPortID = id;
      that.medViewer = {dummyViewer:true};
      that.medViewer.currentFilename = id;
      that.medViewer.isBackgroundMoving = function () { return KViewer.isMoving(fileID) }
	  that.medViewer.toolbar = {$mainViewportSelector: $toggle };


      var bbox = getGlobalBBox()
      var bbox_min = bbox.bbox_min;
      var bbox_max = bbox.bbox_max;

      var vbounds = math.multiply(math.inv(edges),bbox.bbox_max.concat([1]))._data[2] -
          math.multiply(math.inv(edges),bbox.bbox_min.concat([1]))._data[2];
      var numslice = Math.round(Math.abs(vbounds));
      if ((numslice%2) == 0)
        numslice++;
      edges = math.multiply(edges,[
          [1,0,0,0],
          [0,1,0,0],
          [0,0,1,-(numslice-1)/2+0.01],
          [0,0,0,1]
          ])
      that.medViewer.nii = {
          edges: edges,
          voxSize: voxsz,
          pixdim: [1,voxsz[0],voxsz[1],voxsz[2]],
          sizes: [sz[0],sz[1],numslice,sz[3]],
          permutationOrder:nii.permutationOrder,
          arrayReadDirection: nii.arrayReadDirection,
          detsign:math.sign(math.det(edges))
       }
       that.medViewer.niiOriginal = that.medViewer.nii;
       return that;    
    }();    

}



function getGlobalBBox()
{

      var navtool = KViewer.navigationTool;


      var bbox_max = [-Infinity,-Infinity,-Infinity];
      var bbox_min = [Infinity,Infinity,Infinity];

      var files = KViewer.dataManager.getFileList();
      if (files.length == 0)
        return;
      for (var k = 0;k<files.length;k++)
      {
      	 var obj = KViewer.dataManager.getFile(files[k]);
		 if (obj.contentType == 'nii')
		 {
			var edges = obj.content.edges;

            if (( KViewer.navigationMode == 0 && navtool.movingObjs && navtool.movingObjs[files[k]] ) | KViewer.navigationMode == 2)
            {
            	edges = math.multiply(math.inv(KViewer.reorientationMatrix.matrix),edges);
            }
            

			var sz = obj.content.sizes;
			var corners  = [[0,0,0,1],[sz[0]-1,0,0,1],[0,sz[1]-1,0,1],[0,0,sz[2]-1,1],
							[sz[0]-1,sz[1]-1,0,1],[sz[0]-1,0,sz[2]-1,1],[0,sz[1]-1,sz[2]-1,1], [sz[0]-1,sz[1]-1,sz[2]-1,1]];

			var wcorners = math.multiply(edges,math.transpose(corners));
			for (var i =0;i < 3;i++)
			{
				bbox_max[i] = math.max([bbox_max[i],math.max(wcorners._data[i])]);
				bbox_min[i] = math.min([bbox_min[i],math.min(wcorners._data[i])]);
			}
		 }

      }

    return {bbox_min:bbox_min,bbox_max:bbox_max};
}    




function interpretAsColoredVolume(nii,that)
{
    var fname = that.currentFilename;
    if (fname == undefined)
        fname = that.filename
    if (fname == undefined)
        return false;


    return (nii.sizes[3]%3 == 0 &&  ( 
       fname.match(/tensor/i)!=null 
    || fname.match(/col/i)!=null 
    || fname.match(/fod/i)!=null 
    || fname.match(/rgb/i)!=null 
    || fname.match(/_mdir/i)!=null 
    || fname.match(/DBS[\w\ \_]*current/i)!=null 
    ) ); 
}


  function off(ev)
    {
        if (ev.offsetX !== undefined)
            return {
                X: ev.offsetX,
                Y: ev.offsetY
            };
        else
            return {
                X: ev.originalEvent.layerX,
                Y: ev.originalEvent.layerY
            };
    }

function colorPermutation(e2,that,nii)
{

    if (that.showcolored_type)
    {
        var Order = KMedViewer.getPermutationOrder(nii.reordering); 
        var type = that.showcolored_type        
        if (type != "raw")
              e2 = math.multiply(math.inv(Order.mat),e2);
            
        if (type == "GBR")
               e2 = math.multiply(math.matrix([[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 1]]),e2);
        if (type == "GRB")
               e2 = math.multiply(math.matrix([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]),e2);
        if (type == "BRG")
               e2 = math.multiply(math.matrix([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]]),e2);
        if (type == "raw")
               e2 = math.matrix([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
    }
    return e2;
}


function showInfoContextNifti(that,ev)
{
          var info =   KContextMenu(
                    function() {

                var nii = that.nii;

                var msz = "";
                msz = "matrix: " + nii.sizes[0].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[1].toFixed(0) + '&nbsp;&nbsp;' + nii.sizes[2].toFixed(0);
                if (nii.sizes.length > 3 && (nii.sizes[3] > 1 | nii.sizes[3] > 1))
                    msz += ';&nbsp;' + nii.sizes[3].toFixed(0);
                if (nii.sizes.length > 4 && nii.sizes[4] > 1)
                    msz += ';&nbsp;' + nii.sizes[4].toFixed(0);

                if (nii.currentTimePoint.t != 0)
                    msz += "  (t:" + (nii.currentTimePoint.t + 1) + ")";



                if (that.currentFileinfo)
                {
                    if (that.currentFileinfo.patients_id == undefined)
                        var psid = "no associated patient";
                    else
                        var psid = that.currentFileinfo.patients_id + "_" + that.currentFileinfo.studies_id + "<br>";
                }
                else
                    var psid = "localfile <br> ";
                if (userinfo.username == guestuser)
                    psid = "";

                var txt = "<span style='font-size:12px;line-height:13px'><b>";
                if (that.currentFileinfo)
                {
                    if (that.currentFileinfo.SubFolder != undefined && that.currentFileinfo.SubFolder !="")
                         txt +=  that.currentFileinfo.SubFolder + '/' + that.currentFilename + '<br>'   ;
                    else
                         txt +=  that.currentFilename + '<br>'   ;
                }
                txt += "</b>" + psid;
                txt += "</span>";
                txt += "<span style='font-size:3px;line-height:3px'><br></span>";
                txt += "<br>";

                txt +=  "voxsize: " + nii.voxSize[0].toFixed(3) + '&nbsp;&nbsp;' + nii.voxSize[1].toFixed(3) + '&nbsp;&nbsp;' + nii.voxSize[2].toFixed(3)
                    + "<br> <span>" + msz  + "</span>";

                txt += "<br> <br> sform_code: "+nii.sform_code+"  <span>";
                txt += "<br>  qform_code: "+nii.qform_code+"   <span>";
                if (nii.pixdim)
                    txt += "<br> pixdim: "+nii.pixdim.map((x) => Math.round(1000*x)/1000) +"  <span>";
                txt += "<br> sizes: "+nii.sizes +"  <span>";
                txt += "<br> <br> edges ("+nii.form+"): <br> <span>";
                for (var k = 0; k < 3;k++)
                    txt += "&nbsp;&nbsp;" + nii.edges._data[k][0].toFixed(3) + "&nbsp;&nbsp;" +  
                                            nii.edges._data[k][1].toFixed(3) + "&nbsp;&nbsp;" + 
                                            nii.edges._data[k][2].toFixed(3) + "&nbsp;&nbsp;" + 
                                            nii.edges._data[k][3].toFixed(3) + "&nbsp;&nbsp; <br> " ;

                txt +=  "<br>value: y=" + nii.datascaling.slope.toFixed(2) + '*x + ' +nii.datascaling.offset.toFixed(3) + "<br>";
                txt +=  "datatype: " + nii.datatype + "<br>";
                txt +=  "endian: " + nii.endian + "<br>";
                txt +=  "encoding: " + nii.encoding + "<br>";
                txt +=  "filetype: " + nii.filetype + "<br>";
                txt +=  "space: " + nii.space + "<br>";
                if (nii.descrip)
                    txt +=  "descrip: " + JSON.stringify(nii.descrip) + "<br>";
                if (nii.extension != undefined &&
                     nii.extension.content != undefined
                     && typeof nii.extension.content == "string")
                    txt += "exthdr: " + nii.extension.content.substring(0,20) + "..."

                txt += "</span>";

                        var $menu = $("<ul class='menu_context'>").append($(txt));


                        return $menu;

                    },
                    function(str, ev)
                    {                


                    },false,true);
         info(ev);



}
