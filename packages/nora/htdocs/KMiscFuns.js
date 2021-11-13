


/**
* @module MiscFunctions
*/

var resources = {
    lang: "en",
    tooltips: {
        en: {
            roitool_open: "open roitool",
            masterviewport: "use gridding of content as interpolation master",
            changeslicing: "change slicing",
            centerview: "center view at current location",
            resetclims: "reset colormap limits",
            changecolormap: "select a different colormap",
            switchto3d: "Switch to 3D mode",
            zoomviewport: "Zoom viewport",
            closeviewport: "close viewport",
            dragdropviewport: "drag and drop content",

            closetool: "close the tool",
            resizetoolvertically: "resize the tool vertically",
            dragdroptool: "drag and drop the tool",
            patienttrash: "delete selected items or drop an elemet to delete",
            refreshtable: "refresh the patient table",
            anonymmode: "(un)switch table anonymization",
            levelswitcher: "switch table mode",
            singlesel: "switch to single patient mode",
            tabletoggler: "resize/toggle table",
            closeOVL: "close overlay view",

            closefiberview: "close fiber viewer",
            createvisitmap: "create a visitmap of current selection",
            showallfibers: "show all fibers",
            fiberpick: "control fiber picker (use annotations to select fibers)",
            fibercut: "cut fibers to imaging planes",
            cropfibers: "create fiber subset by cropping current selection",
            currentpicker: "enable fiberset for picking",

            batchtestmode: "send jobs to your matlab console",


            isosurfROI: "enable 3D isosurface view of ROI",
            jumptoROI: "jump to center of ROI",
            selectcolor: "select a different color",
            saveuploadROI: "upload/save ROI",
            closeROI: "close view of ROI",
            createroi: "create ROI",
            createemptyroi: "create empty ROI",
            makecurrent: "enable ROI for drawing",

            playstoptimeseries: "play or stop timeseries movie",
            showhide: "show/hide content",
            drawonlyonsimilarcolors: "draw on colors similar to center voxel (use colormap limits to control sensitivity)",
            regionfillsimilarcolors: "unrestricted region filling (use colormap limits and mouse left/right to control sensitivity)",
            regionfillwithinpen: "region filling within pen",
            misctools: "miscellaneous tools",

            mcpsys: "create mcp reorientation system from two/three markers",
            addnewanno: "add new marker to annotation",
            closeanno: "remove this annotation",
            showhideanno: "show/hide annotation",
            jumptopoint: "jump to this point",
            delannopoint: "delete this point",

        }
    }
};





if (typeof jQuery != "undefined")
{

    $.prototype.appendTooltip = function(id)
    {
        var tout;

        var fadeOuttimer = {
            clear: function() {
                clearInterval(this.id)
            },
            callback: function()
            {
                inhibit();
            }
        };


        this.on('mouseenter', function(event) {
            fadeOuttimer.id = setInterval(function() {
                fadeOuttimer.callback()
            }, 8000);
            clearInterval(tout)
            tout = setTimeout(function() {

                $("#KJobinfoTooltip").remove();
                var ttips = resources.tooltips[resources.lang];
                var text = ttips[id];
                if (text == undefined)
                    text = id;
                var $div = $("<div id='standardTooltip'> " + text + " </div>");
                $div.css("top", event.clientY);
                $div.css("left", event.clientX + 15);
                $div.appendTo($(document.body));

                if ($div.position().left + $div.width() > $(document.body).width())
                {
                    $div.css('left', $(document.body).width() - $div.width() - 10);
                    $div.css('top', $div.position().top + 15);
                }
                if ($div.position().top + $div.height() > $(document.body).height())
                    $div.css('top', $(document.body).height() - $div.height() - 10);

                $div.hide();
                $div.fadeIn(200);


            }, 800);



        });









        var inhibit = function()
        {
            fadeOuttimer.clear();
            clearInterval(tout);
            $("#standardTooltip").remove();
        }

        this.on('mouseleave mouseclick mousedown', inhibit);

        return this;

    }












}


function zeroPad(num, places) {
    var zero = places - num.toString().length + 1;
    return Array(+(zero > 0 && zero)).join("0") + num;
}

if (typeof alertify != "undefined")
    alertify.lazy_error = function(errstr,type,delay)
    {
        if (delay == undefined)
            delay = 5000;

        if (!alertify[type])
        {
            alertify.error(errstr);
            alertify[type] = true;
            setTimeout(function() { alertify[type] = false;},delay);
        }    	
    }


Array.prototype.chunk = 
Object.defineProperty(Array.prototype, 'chunk', {
    value:  
    function(fn, chunksize, delay, aggregate, onready)
    {
        var forchunk = function(_this, fn, chunksize, delay)
        {
            if (delay == undefined)
                delay = 0;
            _this.interval_id = setInterval(function(_this) {
                return function()
                {
                    if (_this.cnt == undefined)
                        _this.cnt = 0;
                    for (var k = 0; k < chunksize & k + _this.cnt < _this.length; k++)
                    {
                        fn(_this[k + _this.cnt], k + _this.cnt, _this);
                    }
                    if (aggregate)
                    {
                        aggregate(_this.cnt);
                    }

                    _this.cnt += chunksize;
                    if (_this.cnt >= _this.length)
                    {
                        clearInterval(_this.interval_id);
                        delete _this.cnt;
                        delete _this.interval_id;
                        if (onready != undefined)
                            onready();
                    }

                }
            }(_this), delay);


        }
        ;

        forchunk(this, fn, chunksize, delay);
    }
});

//Float32Array.prototype.chunk =
Object.defineProperty(Float32Array.prototype, 'chunk', {
    value:  
    function(fn, chunksize, delay, aggregate, onready)
    {
        var forchunk = function(_this, fn, chunksize, delay)
        {
            if (delay == undefined)
                delay = 0;
            _this.interval_id = setInterval(function(_this) {
                return function()
                {
                    if (_this.cnt == undefined)
                        _this.cnt = 0;
                    for (var k = 0; k < chunksize & k + _this.cnt < _this.length; k++)
                    {
                        fn(_this[k + _this.cnt], k + _this.cnt, _this);
                    }
                    if (aggregate)
                    {
                        aggregate(_this.cnt);
                    }

                    _this.cnt += chunksize;
                    if (_this.cnt >= _this.length)
                    {
                        clearInterval(_this.interval_id);
                        delete _this.cnt;
                        delete _this.interval_id;
                        if (onready != undefined)
                            onready();
                    }

                }
            }(_this), delay);


        }
        ;

        forchunk(this, fn, chunksize, delay);
    }
}
);


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Octree
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



/** The octree used for fast position lookup of fibers
 * @class
 */

function Octree(position, size, accuracy) {
    this.maxDistance = Math.max(size[0], Math.max(size[1], size[2]));
    this.accuracy = 0;
    this.root = new Octree.Cell(this,position,size,0);
    this.numPoints = 0;
}


Octree.fromBoundingBox = function(bbox) {
    return new Octree(bbox.min.clone(),bbox.getSize().clone());
}
;

Octree.MaxLevel = 4;


Octree.prototype.add = function(p, data) {
    this.numPoints++;
    this.root.add(p, data);
}
;


Octree.prototype.has = function(p) {
    return this.root.has(p);
}
;


Octree.prototype.findNearestPoint = function(p, options) {
    options.includeData = options.includeData ? options.includeData : false;
    options.bestDist = options.maxDist ? options.maxDist : Infinity;
    options.notSelf = options.notSelf ? options.notSelf : false;

    var result = this.root.findNearestPoint(p, options);
    if (result) {
        if (options.includeData)
            return result;
        else
            return result.point;
    }
    else
        return null ;
}
;

Octree.prototype.findNearbyPoints = function(p, r, options) {
    options = options || {};
    var result = {
        points: [],
        data: []
    };
    this.root.findNearbyPoints(p, r, result, options);
    return result;
}
;


Octree.prototype.getAllCellsAtLevel = function(cell, level, result) {
    if (typeof level == 'undefined') {
        level = cell;
        cell = this.root;
    }
    result = result || [];
    if (cell.level == level) {
        if (cell.points.length > 0) {
            result.push(cell);
        }
        return result;
    } else {
        cell.children.forEach(function(child) {
            this.getAllCellsAtLevel(child, level, result);
        }
        .bind(this));
        return result;
    }
}
;


Octree.Cell = function(tree, position, size, level) {
    this.tree = tree;
    this.position = position;
    this.size = size;
    this.level = level;
    this.points = [];
    this.data = [];
    this.children = [];
}
;

Octree.Cell.prototype.has = function(p) {
    if (!this.contains(p))
        return null ;
    if (this.children.length > 0) {
        for (var i = 0; i < this.children.length; i++) {
            var duplicate = this.children[i].has(p);
            if (duplicate) {
                return duplicate;
            }
        }
        return null ;
    } else {
        var minDistSqrt = this.tree.accuracy * this.tree.accuracy;
        for (var i = 0; i < this.points.length; i++) {
            var o = this.points[i];
            var distSq = (p[0] - o[0]) * (p[0] - o[0]) + (p[1] - o[1]) * (p[1] - o[1]) + (p[2] - o[2]) * (p[2] - o[2]);
            if (distSq <= minDistSqrt) {
                return o;
            }
        }
        return null ;
    }
}
;

Octree.Cell.prototype.add = function(p, data) {

    if (this.children.length > 0) {
        this.addToChildren(p, data);
    } else {
        this.points.push(p);
        this.data.push(data);
        if (this.points.length > 10 && this.level < Octree.MaxLevel) {
            this.split();
        }
    }
}
;

Octree.Cell.prototype.addToChildren = function(p, data) {
    for (var i = 0; i < this.children.length; i++) {
        if (this.children[i].contains(p)) {
            this.children[i].add(p, data);
            break;
        }
    }
}
;

Octree.Cell.prototype.contains = function(p) {
    return p[0] >= this.position[0] - this.tree.accuracy
    && p[1] >= this.position[1] - this.tree.accuracy
    && p[2] >= this.position[2] - this.tree.accuracy
    && p[0] < this.position[0] + this.size[0] + this.tree.accuracy
    && p[1] < this.position[1] + this.size[1] + this.tree.accuracy
    && p[2] < this.position[2] + this.size[2] + this.tree.accuracy;
}
;


Octree.Cell.prototype.split = function() {
    var x = this.position[0];
    var y = this.position[1];
    var z = this.position[2];
    var w2 = this.size[0] / 2;
    var h2 = this.size[1] / 2;
    var d2 = this.size[2] / 2;
    var whd = [w2, h2, d2];
    this.children.push(new Octree.Cell(this.tree,[x, y, z],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x + w2, y, z],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x, y, z + d2],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x + w2, y, z + d2],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x, y + h2, z],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x + w2, y + h2, z],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x, y + h2, z + d2],whd,this.level + 1));
    this.children.push(new Octree.Cell(this.tree,[x + w2, y + h2, z + d2],whd,this.level + 1));
    for (var i = 0; i < this.points.length; i++) {
        this.addToChildren(this.points[i], this.data[i]);
    }
    this.points = [];
    this.data = [];

}
;

Octree.Cell.prototype.squareDistanceToCenter = function(p) {
    var dx = p[0] - (this.position[0] + this.size[0] / 2);
    var dy = p[1] - (this.position[1] + this.size[1] / 2);
    var dz = p[2] - (this.position[2] + this.size[2] / 2);
    return dx * dx + dy * dy + dz * dz;
}

Octree.Cell.prototype.findNearestPoint = function(p, options) {
    var nearest = null ;
    var nearestData = null ;
    var bestDist = options.bestDist;

    if (this.points.length > 0 && this.children.length == 0) {
        for (var i = 0; i < this.points.length; i++) {
            var dist = this.points[i].distance(p);
            if (dist <= bestDist) {
                if (dist == 0 && options.notSelf)
                    continue;
                bestDist = dist;
                nearest = this.points[i];
                nearestData = this.data[i];
            }
        }
    }

    var children = this.children;

    var children = this.children
    .map(function(child) {
        return {
            child: child,
            dist: child.squareDistanceToCenter(p)
        }
    })
    .sort(function(a, b) {
        return a.dist - b.dist;
    })
    .map(function(c) {
        return c.child;
    });

    if (children.length > 0) {
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.points.length > 0) {
                if (p[0] < child.position[0] - bestDist || p[0] > child.position[0] + child.size[0] + bestDist ||
                p[1] < child.position[1] - bestDist || p[1] > child.position[1] + child.size[1] + bestDist ||
                p[2] < child.position[2] - bestDist || p[2] > child.position[2] + child.size[2] + bestDist
                ) {
                    continue;
                }
                var childNearest = child.findNearestPoint(p, options);
                if (!childNearest || !childNearest.point) {
                    continue;
                }
                var childNearestDist = childNearest.point.distance(p);
                if (childNearestDist < bestDist) {
                    nearest = childNearest.point;
                    bestDist = childNearestDist;
                    nearestData = childNearest.data;
                }
            }
        }
    }
    return {
        point: nearest,
        data: nearestData
    }
}
;

Octree.Cell.prototype.findNearbyPoints = function(p, r, result, options) {
    for (var i = 0; i < this.points.length; i++) {
        var dx = this.points[i][0] - p[0];
        var dy = this.points[i][1] - p[1];
        var dz = this.points[i][2] - p[2];
        var dist = (dx * dx + dy * dy + dz * dz);
        if (dist <= r * r) {
            if (dist == 0 && options.notSelf)
                continue;
            result.points.push(this.points[i]);
            if (options.includeData)
                result.data.push(this.data[i]);
        }
    }


    var children = this.children

    if (children.length > 0) {
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            //if (child.points.length > 0)
            {
                if (p[0] < child.position[0] - r || p[0] > child.position[0] + child.size[0] + r ||
                p[1] < child.position[1] - r || p[1] > child.position[1] + child.size[1] + r ||
                p[2] < child.position[2] - r || p[2] > child.position[2] + child.size[2] + r
                ) {
                    continue;
                }
                child.findNearbyPoints(p, r, result, options);
            }
        }
    }
}
;








function executeImageWorker(execObj,Buffers,progress,onready,worker)
{

        if (worker == undefined)
        {
            var scriptname = 'KImageProcWorker.js' + '?' +  static_info.softwareversion;
            if (typeof url_pref != "undefined")
               scriptname = url_pref + scriptname;
           
            worker = new Worker(scriptname);
            worker.postMessage = worker.webkitPostMessage || worker.postMessage;
            worker.addEventListener('message', function(e) {
                e = e.data;
                if (e.msg == 'done')
                {
                    if (progress != undefined)
                        progress();
                    onready(e);
                }
                else
                    if (progress != undefined)
                        progress(e.msg);
            }, false);

            worker.kill = function()
            {
                worker.postMessage({'msg':'kill'},[]);
            }
        }


		worker.postMessage(execObj,Buffers); // Send data to our worker.

		return worker;		
}










///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// generic context menu
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** A generic contextmenu
* @param {function} themenu - A function returning an "ul" containing the menu
* @param {function} theselfun - called on menu selection with signature theselfun(onchoice,mouseupevent,mousedownevent). First argument contains onchoice attribute of menu "li"
* @param {logical} loose - ??
* @param {logical} keepOpenAfterClick - menu disappears only on mouse leave
* @param {logical} selectonrelease    - allow item selection on moushold- mouseup, can be dangerous for unexperienced users
* @return {function} - a menu creater function that should be called upon click/mousedown etc.
*/






function KContextMenu(themenu, theselfun, loose, keepOpenAfterClick, eventonmenu, selectonmouseup)
{
    var last_ev;
    var createFun = function(ev)
    {
        if (ev != undefined)
        {
            ev.preventDefault();
            ev.stopPropagation();
        }
        last_ev = ev;
        var target = ev.target;
        var $cmdiv = $("<div class='patientTableContextmenu'>");
        
        var mymenu = themenu(ev);
        if (mymenu == undefined)
            return;
        // this was always called twice, with (ev)...?
        //var $menu = themenu(ev).appendTo($cmdiv);
        var $menu = mymenu.appendTo($cmdiv);


        // correct for chrome bug, where a hover is not triggered during mousedown
        $menu.find("li").each(function(i, a) {
            $(a).mouseenter(function() {
                $(this).addClass('jsHover');
            })
            .mouseleave(function() {
                $(this).removeClass('jsHover');
            })
        });
        
        if(keepOpenAfterClick)
        {
            var offs_top  = -10;
            var offs_left = -5;
        }
        else
        {
            var offs_top  = 5;
            var offs_left = 5;
        }



        $cmdiv.css("display", "block");
        $cmdiv.css({
            left: ev.pageX + offs_left,
            top: ev.pageY + offs_top
        });
        $cmdiv.show();
        var selFun = function(ev2)
        {
            var str;
            var $target = $(ev2.target)
            for (var k = 0; k < 3; k++)
            {
                str = $target.attr("onchoice")
                if (str != undefined)
                    break;
                else
                    $target = $target.parent();
            }

            if (str != 'preventSelection')
            {
                ev2.preventDefault();
                ev2.stopPropagation();
                if (str != undefined | !loose) // (keepOpenAfterClick | !loose )  // | ev2.type == "mousedown"  | ev2.type == "mouseup") )
                {
                    $cmdiv.remove();
                    fadeOuttimer.clear();
                    $(document.body).off("mouseup mousedown");
                }

                if (theselfun(str, ev2, ev) == "close")
                    return;

                if (keepOpenAfterClick)
                    createFun(last_ev);

            }
        }
        ;


        $(document.body).append($cmdiv);


        var uls = $cmdiv.find("ul,div");
        var left = 0;
        for (var k = 0; k < uls.length;k++)
        {
            var $ul = $(uls[k]);
            var disp = $ul.css('display');
            if ($ul.offset().left +left + $ul.width() > $(document.body).width())
                $ul.css('left',-($ul.offset().left +left + $ul.width() - $(document.body).width())- offs_left-20);
            if ($(document.body).height() != 0 && $ul.offset().top + $ul.height() > $(document.body).height())
                $ul.css('top', -($ul.offset().top + $ul.height() - $(document.body).height())- offs_top-10);

            if (k==0)
                left = $ul.offset().left + $ul.width()-20 ;
        }


        var $which = $(document.body);
        if (eventonmenu)
        {
             $which = $cmdiv;
             $(document.body).on("mousedown",function()
             {
                   $(document.body).off("mousedown");
                   $cmdiv.off("mouseup mousedown");            
                   $cmdiv.remove();
             })

        }

        if (keepOpenAfterClick || selectonmouseup === false )
            $which.on("mousedown", selFun);
        else
            $which.on("mouseup mousedown", selFun);

        $which.on("contextmenu",function(e)
        {
            e.preventDefault();
        });

        $cmdiv.on("mouseleave", function(ev) {

            $which.off("mouseup mousedown");
            fadeOuttimer.clear();
            $cmdiv.remove();
        });

        var fadeOuttimer = {
            clear: function() {
                clearInterval(this.id)
            },
            callback: function()
            {
                this.clear();
                $which.off("mouseup mousedown");
                $cmdiv.fadeOut(1000);
            }
        };
        fadeOuttimer.id = setInterval(function() {
            fadeOuttimer.callback()
        }, 10000000);

    }

    return createFun;

}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// shared links
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** open a shared link. Information comes from php within "sharedLink" variable 
 * @param {function} onready - called after establishment of shared viewing state
*/
function openSharedLink(sharedLink,onready)
{

    // extend the state with the shared link. Can be done now safely, as the presets are not overwritten
    // dangerous. can destroy project state and everything ...
    //$.extend(state, share dLink, true);

   
    // etabslish tree state
    if (userinfo.username != guestuser && sharedLink.project != undefined)
    {
        selectProject(sharedLink.project, function() {


            // set settings
            if (sharedLink.ViewerSettings !== undefined)
            {
                state.viewer = sharedLink.ViewerSettings;
                stateManager.applyState(state);
            }

            switchto(state.viewer.selectionMode,undefined,function()
            {


                patientTableMirror.nodesExpanded = sharedLink.expandedNodes || [];
                patientTableMirror.selectedItems = sharedLink.selectedItems || [];
                patientTableMirror.mirrorState();





                currentPSID = sharedLink.currentPSID || {};
                if (currentPSID.patients_id)
                {
                    if (state.viewer.selectionMode[1] == 's')
                    {
                        setEditModeText(currentPSID.patients_id + riddelim + currentPSID.studies_id);
                    }
                    if (state.viewer.selectionMode[1] == 'p')
                    {
                        setEditModeText(currentPSID.patients_id);
                    }
                }
                loadSharedContent();
            });
        });
    }
    else
    {

            // set settings
        if (sharedLink.ViewerSettings !== undefined)
        {
            state.viewer = sharedLink.ViewerSettings;
            stateManager.applyState(state);
        }

        loadSharedContent();

    }

    function loadSharedContent()
    {

        $(document.body).addClass("wait");		

        if (sharedLink.toolstate)
             KToolWindow.reestablishToolState(sharedLink.toolstate);

  
        if (sharedLink.naviMode != undefined)
        {
            KViewer.navigationTool.switchToNavimode( sharedLink.naviMode);
            if (sharedLink.navi_reorientationMatrix!= undefined && sharedLink.navi_reorientationMatrix.notID)
            {
                KViewer.reorientationMatrix.notID = true;
                var transform = sharedLink.navi_reorientationMatrix;
                KViewer.reorientationMatrix.name = transform.name;
                KViewer.reorientationMatrix.matrix = math.matrix(transform.matrix);
                KViewer.navigationTool.transform.update();
            }

            //KViewer.reorientationMatrix = sharedLink.navi_reorientationMatrix;
        }
        
        // load annos
        if (sharedLink.annotations != undefined)
        {
            if (markerProxy != undefined)
            {
                markerProxy.delAll();
                markerProxy.import(sharedLink.annotations.content);
                if (sharedLink.annotations.panelenabled)
                {
                    for(var p in markerProxy.markersets)
                         markerProxy.markersets[p].showPanel();
                }
            }
        }
        // load atlas deffield
        if (sharedLink.atlas_defField != undefined)
            KViewer.dataManager.loadData({
                URLType: 'serverfile',
                fileID: sharedLink.atlas_defField,
                json: {
                    project: sharedLink.project
                },
                callback: KViewer.atlasTool.addAtlas
            });


        // load viewport content
        var params = sharedLink.viewports || [];
        var q = [];
        var derived_q = [];




        if (sharedLink.atlases != undefined & !electron)
            for (var k = 0; k < sharedLink.atlases.length; k++)
            {            
               var param = ({ URLType: 'serverfile', fileID:sharedLink.atlases[k].fileID,json:{project:sharedLink.atlases[k].project},intent:{atlas:true,project:sharedLink.atlases[k].project}});
               if (param.json.project == undefined)
                  param.json.project =    sharedLink.project    
               q.push(param);     
            }

        for (var k = 0; k < params.length; k++)
        {
            if (params[k])
            {
                if (params[k].fileID.refvisit_tck)
                {
                    derived_q.push(params[k])
                    continue;
                }
                else if (params[k].id.search("atlas") > -1)
                {
                    if (params[k].project != undefined)
                        params[k].json = {
                            project: params[k].project
                        };
                    else
                        params[k].json = {
                            project: sharedLink.project
                            //static_info.atlas.project
                        };
                    params[k].fileID = params[k].fileID.replace("atlas_", "");
                }
                else
                    params[k].json = {
                        project: sharedLink.project
                    }


                q.push(params[k]);
            }
        }
       

        if (electron)
        {
            for (var k = 0; k < q.length;k++)
            {
                var filepath = q[k].fileID; 

                if (sharedLink.absolutePath)
                    filepath = path.join(sharedLink.absolutePath,filepath);

                filepath = filepath.replace(/\\/g,"/"); // for windows

                q[k].URLType = "localfile";
                q[k].file =  {name:filepath,local:true};
                q[k].filename = filepath;
                q[k].fileID = "localfile:"+filepath;
            }
        }
        setTimeout(function(){
            $(document.body).addClass("wait");		
            loadingQueue.execQueue(q, function() {
                if (sharedLink.navi_movingObjs && sharedLink.navi_movingObjs.length > 0)
                {
                    for (var k = 0; k < sharedLink.navi_movingObjs.length; k++)
                        KViewer.navigationTool.movingObjs[sharedLink.navi_movingObjs[k]] =
                        KViewer.dataManager.getFile(sharedLink.navi_movingObjs[k]);
                    KViewer.navigationTool.updateMoving();
                }
                if (sharedLink.mainviewport != undefined)
                    KViewer.toggleMainViewport(sharedLink.mainviewport, true);

                //	KViewer.resetCrossHair();
                if (sharedLink.position)
                    KViewer.currentPoint = math.matrix(sharedLink.position);


                if (sharedLink.ironSight)
                {
                    ironSight.toggle();
                }

                if (sharedLink.WMQLpanels != undefined)
                {
                    for (var k = 0; k < sharedLink.WMQLpanels.length;k++)
                    {
                        KWMQLPanel.openPanel(KViewer.obj3dTool.objs[sharedLink.WMQLpanels[k].tract_id],
                                             KViewer.atlasTool.objs[sharedLink.WMQLpanels[k].atlas_id],
                                             sharedLink.WMQLpanels[k]);

                    }
                }



                signalhandler.send("reslice positionChange");


                for (var k=0;k < derived_q.length;k++)
                {
                    if (derived_q[k].fileID.refvisit_tck != undefined)                    
                    {
                        var vport_id = derived_q[k].fileID.viewport_id;
                        var vmap_params = derived_q[k].fileID.refvisit_params;
                        var fibid = derived_q[k].fileID.refvisit_tck;                      
                        var objs = KViewer.viewports[vport_id].medViewer.objects3D;
                        for (var j = 0; j < objs.length;j++)
                            if (KViewer.viewports[vport_id].medViewer.objects3D[j].fibers && 
                                KViewer.viewports[vport_id].medViewer.objects3D[j].fibers.fileID == fibid)
                            {
                                var tck = KViewer.viewports[vport_id].medViewer.objects3D[j];
                                var fobj;
                                if (vmap_params.terminal)
                                {
        				  	  	    tck.visitworker_terms = tck.createVisitMap(vmap_params.undersamp,vmap_params.terminal,true,true);
        				  	  	    fobj = tck.visitworker_terms.fobj;
                                }
                                else
                                {
        				  	  	    tck.visitworker = tck.createVisitMap(vmap_params.undersamp,undefined,true,true);        
        				  	  	    fobj = tck.visitworker.fobj;
                                }
                                var target_vid = derived_q[k].intent.viewportID
                                KViewer.viewports[target_vid].setContent(fobj,{intent:derived_q[k].intent});                                       

                                fobj;
                            }
				  	  }
                }


      /*
                setTimeout(function()
                {
                    for (var r = 0;r < markerProxy.markersets.length;r++)
                    {
                         for (var x in  markerProxy.markersets[r].onupdate)            
                             markerProxy.markersets[r].onupdate[x]();
                    }   
                },1000);
        */    

                if (sharedLink.TableHidden)
                    KViewer.toggleTableHide();


                if (markerProxy != undefined && sharedLink.currentAnnot != undefined)
                   markerProxy.setCurrentSet(sharedLink.currentAnnot,true);

                if (sharedLink.zoomedViewport != -1 &&  KViewer.viewports[sharedLink.zoomedViewport] != undefined )
                    KViewer.viewports[sharedLink.zoomedViewport].zoomViewPort();


                $(document.body).removeClass("wait");		
                $("#KLoadingFrame").css('display','none')


                if (onready)
                    onready();

            });
        },0);
    }
}






function saveWorkstate(that)
{
    var s = gatherState('savestate');
    if (electron)
    {
        uploadJSON("workstate.json",s,{subfolder:'workstates',tag:'workstate'},function(){});					
    }
    else
        alertify.prompt("Enter a name for of state", function(e,name)
        {
            if (e)
            {
                that.lastProjectStatename = name;
                uploadJSON(name,s,{subfolder:'workstates',tag:'workstate'},function(){});					
            }
        } ,that.lastProjectStatename);

}



/** objectifies viewing state including all currently loaded files etc.
 * @return {object} - an object containg all state information
 */
function gatherState(issuer)
{

    function mapID(obj)
    {
        var id ;

        if (obj.content && obj.content.refvisit_params)
        {
            id = {refvisit_tck:obj.content.refvisit_tck.fibers.fileID,
                  viewport_id:obj.content.refvisit_tck.viewer.viewport.viewPortID,
                  refvisit_params:obj.content.refvisit_params}
            return id;


        }
        if (obj.fileID)
            id = obj.fileID;
        if (obj.currentFileID)
            id = obj.currentFileID;
        if (obj.trackingVolID)
            id = obj.trackingVolID;
        if (id == undefined)
            return undefined;
        if (electron)
        {
            var file = KViewer.dataManager.getFile(id);
            return file.fileinfo.SubFolder + "/" + file.fileinfo.filename;

        }
        else        
        {
            return id;
        }
    }


    // gather viewport content and overlays
    var imgs = [];
    for (var k = 0; k < KViewer.viewports.length; k++)
    {
        if (KViewer.viewports[k] == undefined)
            continue;
        if(KViewer.viewports[k].getCurrentViewer)
            var viewer = KViewer.viewports[k].getCurrentViewer();
        else
            viewer = undefined;   
        if (viewer != undefined 
            && ( ( viewer.currentFileID != undefined & viewer.currentFileID != "") || (viewer.nii != undefined && viewer.nii.dummy != undefined) ) )
        {
            var myid = "ID" + viewer.currentFileID;
            if (viewer.viewerType == "medViewer")
            {

                /*  that.zoomFac = zl[0];
                that.zoomOriginY = zl[1];// / hei_cm * $canvas.height();
                that.zoomOriginX =
	*/


                var gl_props;
                if (viewer.isGLenabled())
                    gl_props = {alpha:viewer.gl.camera.alpha,
                                  beta:viewer.gl.camera.beta,
                                  radius:viewer.gl.camera.radius,
                                  planesVisibility:viewer.gl.getPlanesVisibility()};


                if (viewer.currentFileID != undefined)
                {

                    var main_img = {
                        id: myid,
                        fileID: mapID(viewer), //viewer.currentFileID,
                        URLType: 'serverfile',
                        name:viewer.currentFilename,
                        intent:
                        {
                            viewportID: k,
                            zooms: viewer.getRelativeZoomLims(),
                            cmap: viewer.histoManager.cmapindex,
                            clim: viewer.histoManager.getManuallyEnteredClim(issuer == 'savestate'),
                            gl: viewer.isGLenabled(),
                            gl_props:gl_props,
                            isosurf: (viewer.refSurfView!=undefined)?viewer.refSurfView.getViewProperties():undefined,
                            slicing: viewer.getSlicingDimOfWorld(),
                            showcolored_type:viewer.showcolored_type,
                            showcolored:viewer.showcolored,
                            transfactor:viewer.transfactor
                        }
                    };

                    if (viewer.mosaicview && viewer.mosaicview.active)
                    {
                        main_img.mosaic = {border:viewer.mosaicview.border,
                          nx: viewer.mosaicview.nx,
                          nx_cont: viewer.mosaicview.nx_cont,
                          zoom: viewer.mosaicview.zoom,
                          start:viewer.mosaicview.start,
                          end:viewer.mosaicview.end};
                    }
        
                    if (viewer.nii && viewer.nii.quiver_params)
                    {
                        main_img.intent.quiver_params = viewer.nii.quiver_params;
                    }


                    imgs.push(main_img);
                }
                if (viewer.overlays != undefined)
                    for (var j = 0; j < viewer.overlays.length; j++)
                    {
                        var myid = "ID" + viewer.overlays[j].currentFileID;

                        imgs.push({
                            id: myid + "ovl",
                            fileID: mapID(viewer.overlays[j]),
                            name:viewer.overlays[j].currentFilename,
                            URLType: 'serverfile',
                            intent:
                            {
                                overlay: true,
                                viewportID: k,
                                isosurf: (viewer.overlays[j].refSurfView!=undefined)?viewer.overlays[j].refSurfView.getViewProperties():undefined,
                                cmap: viewer.overlays[j].histoManager.cmapindex,
                                transparent: viewer.overlays[j].histoManager.blending,
                                clim: viewer.overlays[j].histoManager.getManuallyEnteredClim(issuer=='savestate'),
                                showcolored:viewer.overlays[j].showcolored,
                                showcolored_type:viewer.overlays[j].showcolored_type,
                                posnegsym:viewer.overlays[j].histoManager.posnegsym,
                                blocky:viewer.overlays[j].histoManager.blocky,
                                visible:viewer.overlays[j].visible,
                                hideview:viewer.overlays[j].hideview,
                                quiver_params:viewer.overlays[j].nii.quiver_params,
                                outlines: (viewer.overlays[j].outlines != undefined)?((viewer.overlays[j].color != undefined)?viewer.overlays[j].color:0):undefined
                            }
                        });

                 


                    }
                if (viewer.ROIs != undefined)
                    for (var j = 0; j < viewer.ROIs.length; j++)
                    {
                        var myid = "ID" + viewer.ROIs[j].roi.fileID;
                        var roi = viewer.ROIs[j].roi;
                        var isosurf;
                       // if (viewer.ROIs[j].refSurfView != undefined)
                         //   isosurf = true;
                        imgs.push({
                            id: myid + "roi",
                            fileID: mapID(roi),
                            name:roi.filename,
                            URLType: 'serverfile',
                            intent:
                            {
                                roi: true,
                                isosurf: (viewer.ROIs[j].refSurfView!=undefined)?viewer.ROIs[j].refSurfView.getViewProperties():undefined,
                                color: viewer.ROIs[j].color,
                                viewportID: k,
                                visible:viewer.ROIs[j].visible
                            }
                        });
                    }
                if (viewer.objects3D != undefined)
                    for (var j = 0; j < viewer.objects3D.length; j++)
                    {
                        var obj = viewer.objects3D[j];
                        var fid, assoc_annot;
                        var clim;
                        var more_intent;
                        if (obj.getViewProperties)
                            more_intent = obj.getViewProperties()
                        else
                            more_intent = {};
                        if (viewer.currentFileID == undefined)
                            more_intent.gl_props = gl_props
                        if (obj.fibers != undefined | obj.contour != undefined)
                        {

                            if (obj.fibers)
                            {
                                fid = mapID(obj.fibers);     
                                if (obj.fibers.tckjsonref)                       
                                    fid = mapID(obj.fibers.tckjsonref);
                                else
                                {
                                    if (obj.children && obj.children.length > 0)
                                    {
                                        var json = KViewer.obj3dTool.save(obj.fibers,undefined,true)
                                        more_intent.jsonsubsets = json;
                                    }
                                }
                                if (obj.Selection && obj.parent)
                                    more_intent.select = obj.Selection.name;
                                else
                                    more_intent.select = 'all';

                                if ((obj.subsetToDisplay != undefined && obj.subsetToDisplay.length > 0) | 
                                      (obj.isParentView && obj.subsetToDisplay == undefined))

                                {
                                    more_intent.visible = true; // not yet
                                    more_intent.donotmakecurrent = true; // not yet
                                }
                                else
                                {
                                    more_intent.visible = false; // not yet
                                    more_intent.donotmakecurrent = true; // not yet

                                }
                                if (obj.isCurrent)
                                  more_intent.donotmakecurrent = false;
                                    

                                if (obj.trackingVol)
                                {
                                    fid = mapID(obj);
                                    more_intent.createFiberTracking = obj.getViewProperties();
                                }                                    

                                                                  
                                var annots = markerProxy.getSets();
                                for (var r = 0;r < annots.length;r++)
                                    if (annots[r].uuid == obj.associated_annotation)
                                    {
                                        more_intent.assoc = r;
                                        break;
                                    }
                            }
                            else
                            {
                                fid = mapID(obj.contour);     
                                more_intent.select = obj.select;
                
                            }
                            more_intent.fibcut = obj.fibcut;
                            more_intent.fibcut_proj = obj.fibcut_proj;
                            more_intent.fibcut_thres = obj.fibcut_thres;
                            more_intent.color = obj.color;
                            
                        }


                        var atlasiso = undefined
                        var project = undefined;
                        if (obj.surf != undefined)
                        {                            
                            fid = mapID(obj.surf);
                            for (var jj=0;jj <obj.overlays.length; jj++)
                            {
                                var ovl = obj.overlays[jj];
                                imgs.push({
                                    id: myid + "roi",
                                    fileID: mapID(ovl),
                                    URLType: 'serverfile',
                                    name:ovl.filename,
                                    intent:
                                    {
                                        surfcol: fid,
                                        cmap: ovl.histoManager.cmapindex,
                                        clim:ovl.histoManager.clim,
                                        viewportID: k,

                                    }})
                            }                            
                            if (obj.surf.atlasref)
                            {
                                fid = mapID(obj.surf.atlasref.atlas),
                                project =  obj.surf.atlasref.atlas.project,
                                atlasiso = obj.surf.atlasref.label;
                            }
                            else if (obj.refRoiView != undefined)
                                continue;
                        }
                     
                        if (obj.cmat != undefined)
                        {
                            fid = mapID(obj.cmat);
                            clim = obj.histoManager.getManuallyEnteredClim(issuer == 'savestate');
                        }
                        imgs.push({
                            id: fid + (atlasiso?"atlas":"") + "3D",
                            fileID: fid,
                            project: project,
                            name:obj.filename,
                            URLType: 'serverfile',
                            intent: $.extend(
                            {
                                GL: true,
                                gl: true,
                                atlasiso:atlasiso,
                                viewportID: k,
                                cuts: obj.cuts,
                                assoc_annot: assoc_annot,
                                clim: clim
                            },more_intent)
                        });

                        if (obj.surf != undefined)
                        {
                           

                        }
                    }
                if (viewer.atlas != undefined)
                    for (var j = 0; j < viewer.atlas.length; j++)
                    {
                        var obj = viewer.atlas[j];
                        imgs.push({
                            id: myid + "atlas",
                            fileID: mapID(obj.atlas),
                            project: obj.atlas.project,
                            URLType: 'serverfile',
                            intent:
                            {
                                viewportID: k,
                                hasPanel :   ( obj.atlas.panel != undefined)? obj.atlas.panel.getState() : undefined,
                            }
                        });
                    }


            }
            else if (viewer.viewerType == "formViewer")
            {
                if (viewer.currentFileID == 'NA')
                {
                    var fid = KViewer.formManager.getFormByID(viewer.currentFormID).name;
                    imgs.push({
                        id: "ID" + fid + 'formNA',
                        fileID: fid,
                        URLType: 'form',
                        intent: {
                            viewportID: k
                        }
                    });
                }
                else
                {
                    var fid = mapID(viewer);
                    imgs.push({
                        id: "ID" + fid + "form",
                        fileID: fid,
                        URLType: 'serverfile',
                        intent: {
                            viewportID: k
                        }
                    });
                }
            }
            else
            {
                var fid = mapID(viewer);
                imgs.push({
                    id: "ID" + fid,
                    fileID: mapID(viewer),
                    filename: viewer.currentFilename,
                    URLType: 'serverfile',
                    intent: {
                        viewportID: k
                    }
                });
            }

        }
    }


    var atlas_defField;
    if (KViewer.atlasTool.defField != undefined)
        atlas_defField = KViewer.atlasTool.defField.fileID;

    var atlases = [];
    for (a in KViewer.atlasTool.objs)
        atlases.push({fileID:KViewer.atlasTool.objs[a].fileID,
                       project:KViewer.atlasTool.objs[a].project});

    var WMQLpanels = [];
    if (typeof KWMQLpanel != "undefined")
    for (var k in KWMQLPanel.panels)
    {
        if (KWMQLPanel.panels[k].visible)
        {
            WMQLpanels.push(KWMQLPanel.panels[k].getState());
        }
            
    }


    // gather settings
    var vset = $.extend(true, {}, ViewerSettings);
   // delete vset.SearchText;
   // delete vset.SearchText_a;
    vset.crosshairModeDefault = KViewer.crosshairMode;
    vset.histoModeDefault = KViewer.histoMode;

    var position;
    if (KViewer.currentPoint)
        position = KViewer.currentPoint._data;
    // and pack everything

    var annotations = {content:markerProxy.objectify()};

    var currentAnnot = -1;
    var keys = Object.keys(markerProxy.markersets);
	for (var k=0;k < keys.length;k++)	
	{
	   if (markerProxy.currentSet == markerProxy.markersets[keys[k]])
            currentAnnot = k;
     }
     
    var iron_visible = false;
    if (typeof ironSight != "undefined" && ironSight.visible)
        iron_visible = true;
   


    var shareinfo = {
        project: project,
        viewports: imgs,
        position: position,
        annotations: annotations,
        currentAnnot:currentAnnot,
        SearchText:state.SearchText,
        SearchText_a:state.SearchText_a,
        WMQLpanels:WMQLpanels,
        ironSight:iron_visible,
        naviMode:KViewer.navigationMode,
        navi_movingObjs: Object.keys(KViewer.navigationTool.movingObjs),
        navi_reorientationMatrix: KViewer.reorientationMatrix,
        mainviewport: KViewer.mainViewport,
        ViewerSettings: vset,
        atlas_defField: atlas_defField,
        atlases:atlases,
        TableHidden: TableHidden,
        enabledTool: KTool_enabled(),
        toolstate: KToolWindow.getToolsState(),
        styletheme:userinfo.styletheme,
        zoomedViewport:KViewer.zoomedViewport,
        electron:electron
    };

    if (typeof projectInfo != "undefined")
        shareinfo.project = projectInfo.name;

    if (typeof patientTableMirror != "undefined")
    {
        var expanded = {}
        for (var k in patientTableMirror.nodesExpanded )
            if (patientTableMirror.nodesExpanded[k] == true)
            {
                v = true;
                for (var j in patientTableMirror.nodesExpanded )
                {
                   if (k!=j)
                   {
                      if (k.substring(0,j.length) == j)
                      {
                          v = v & patientTableMirror.nodesExpanded[j];
                      }

                   }
                }
                if (v)
                  expanded[k] = true;
            }

        shareinfo.expandedNodes= expanded;
        shareinfo.selectedItems= patientTableMirror.selectedItems;
        shareinfo.currentPSID= currentPSID;
        shareinfo.ProjectSettings= ProjectSettings;

    }

    if (typeof shareTour != "undefined")
        shareinfo.tour = shareTour;



    return shareinfo;
}

/** called to creae shared link
 */
function shareLink()
{
    var shareinfo = gatherState('savestate');
    var sharedID = "";
    if (sharedLink && sharedLink.shareID)
        sharedID = "&shareID=" + sharedLink.shareID + "&ID=" + sharedLink.ID;

    // store all this as a shared link
    ajaxRequest('command=share&json=' + encodeURIComponent(JSON.stringify(shareinfo)) + sharedID, function(result) {
        var url = myownurl() + "?sharelink=" + result.id;
        if (sharedID != "")
            alertify.prompt("Copy the link below to clipboard (old shared link was overwritten): Ctrl+C, Enter", function() {}, url);
        else
            alertify.prompt("Copy the link below to clipboard: Ctrl+C, Enter", function() {}, url);
    });


}




function startImageLoader(loaders,callback)
{


   var loaders_ = []
   for (var k = 0; k < loaders.length;k++)
   {
       var l = loaders[k];
       if (l.url != undefined)
          l.pattern = l.url;
       l.enabled = true;
       if (l.viewportID == undefined)
       {
            l.viewportID = "0,1,2";
            l.intent.slicing = [1,0,2];
       }
       loaders_[k] = l;
   }


   startAutoloader(loaders_,undefined , undefined, callback);


}










function startAutoloader(loader, psid, onerror, callback)
{
	// rows can be a file list from patient table or similar.
	// if rows is undefined, the search will performed with an ajax over the whole patient table.

   // close all is already applied further down
   //signalhandler.send("close");


   if (state.viewer.selectionMode[1] == 'a' | loader == undefined)
   	  return;

   var queue = [];
   var queue_ovlsrois = [];


   // iterate over all loaders
   for (var i=0;i<loader.length;i++)
   {
        var currentLoader = loader[i];
        if (currentLoader.intent.auto_tag == undefined)
        	currentLoader.intent.auto_tag = i;

        
		if(currentLoader.enabled !== undefined) // pattern must be set!!!
			if(currentLoader.enabled === false) // pattern must be set!!!
				continue;
		if(currentLoader.pattern === undefined | currentLoader.pattern.trim() === '') // pattern must be set!!!
		{
			console.log('error in autolader. no pattern set.')
			continue;
		}


		var pat = currentLoader.pattern.replace("$USER",userinfo.username);
		if(psid != undefined) 
		{
			// check if the pattern contains a specific piz (with this, an image from the same set can be loaded for all patients, e.g. for atlases)
          	if(pat.search('PIZ') == -1)   
              {
					
				pat = pat.split(" OR ").map(function (x) { return x+ ' PPIZ:'+ psid.piz }).join(" OR ");

			  }

            // No, you also want to be able to select studies in patient mode -->> append the study ID only in study mode. IN patient mode, will select ANY study from this patient            
            //if( psid.sid != undefined && ViewerSettings.selectionMode[1] == "s")
		// 0 = patient or study, 1=patient, 2=study


            if( psid.sid != undefined && ViewerSettings.autoloaderLevel != 1 )
            {
            	
           		if(pat.search('StudyID') == -1)
					pat = pat.split(" OR ").map(function (x) { return x+ ' SStudyID:'+ psid.sid }).join(" OR ");
            }
		}
		
		// extend with varpattern, e.g for autoloaders
		pat = (pat + (currentLoader.varpattern!==undefined?currentLoader.varpattern:''));
		// abuse the pattern as fileID, so that datamanger can store already loaded files	
  		var fi = {ID: pat};
		

        var shared = {};

	    if (fi != -1)
			{
			// extract the numeric values from the loader def if not already in numeric strcuture. To be implemented elsewhere
			
			var slicing =[];
			var cmaps = [];
			var select = [];
			var color = [];
			var ids = [undefined];
			if (currentLoader.viewportID != undefined)
			{
				ids  = currentLoader.viewportID.toString().split(",");
				ids.forEach(function(part,index,array) { array[index] = parseInt(part); });
			}
			if(currentLoader.intent !== undefined)
			{
				if (currentLoader.intent.color != undefined && Array.isArray(currentLoader.intent.color))
					color = currentLoader.intent.color.slice(0);
				if (currentLoader.intent.select != undefined)
					select = currentLoader.intent.select.slice(0);
				if (currentLoader.intent.slicing != undefined)
				{
					slicing   = currentLoader.intent.slicing.toString().split(",");  
					slicing.forEach(function(part,index,array) { if ($.isNumeric(part)) array[index] = parseInt(part); else array[index] = part; });
				}
				if (currentLoader.intent.cmap != undefined)
				{
					cmaps   = currentLoader.intent.cmap.toString().split(",");  
					cmaps.forEach(function(part,index,array) { if ($.isNumeric(part)) array[index] = parseInt(part); else array[index] = part; });
				}
			}

			 for (var j=0;j< ids.length; j++)
				 {
						// auto loader defaults
						var finalLoader =  new Object();
						finalLoader.clim = undefined;
						finalLoader.cmap = undefined;
						finalLoader.transparent = undefined;
						finalLoader.overlay = false;
						finalLoader.gl = false;
						
						// extend with current loader first
						$.extend(true, finalLoader, currentLoader); 

						// extend with intent, intent wins !!!
						$.extend(finalLoader, currentLoader.intent); 

						finalLoader.viewportID = ids[j];   // overwrite id with single number
						if(color[j] != undefined)
						   finalLoader.color = color[j];   
						if(select[j] != undefined)
						   finalLoader.select = select[j];   
						if(slicing[j] != undefined)
						   finalLoader.slicing = slicing[j]; 
						if(cmaps[j] != undefined)
						   finalLoader.cmap = cmaps[j];   


                        // additional information could be stored in clims. not so nice, add field for that in future. and ideally as object
                        if( finalLoader.clim !== undefined)
                            $.extend(true, finalLoader, extractDetailsFromClimString(currentLoader.clim) )

                        finalLoader = $.extend(true,{viewportID:ids[j], slicing:slicing[j]},finalLoader)
						finalLoader.shared =shared;

                        // set the file params
                        
                        var item = {fileID: fi.ID, URLType: 'serverfile',intent: finalLoader  };
                        item.intendedName = finalLoader.intendedName;
                        item.filetype = finalLoader.filetype;

                        //finalLoader.fileparams = {fileID: fi.ID, URLType: 'serverfile'  }
                        // queue.push( $.extend(true, { viewportID:ids[j], slicing:slicing[j] },   finalLoader   ) ); //make a deep copy and add j
                        if (onerror != undefined)
                            item.onerror = onerror;
                        if (item.intent.roi || item.intent.overlay || item.intent.createFiberTracking) // these are loader after all the others
                            queue_ovlsrois.push(item);
                        else
                            queue.push(item);
				 }
			 }
		  else
		  {
		  	 if (onerror == undefined)
			   $.notify("no file found with pattern " + currentLoader.pattern );
			 else 
			     onerror("no file found with pattern " + currentLoader.pattern );
		  }
		} // END iterate over all loaders
   

	   queue = queue.concat(queue_ovlsrois);

	   var fileQuerys = [];
       for (var k = 0;k < queue.length;k++)
		  fileQuerys[k] = queue[k].fileID;

		if (KViewer.dataManager.getFileList().length >0)
		{
		   KViewer.closeAll(undefined, loader.whattoclose );	
		}

  	   $(document.body).addClass('wait');
		  
	   if (typeof ajaxRequest != "undefined")
  	       ajaxRequest('command=resolve_file_query&json=' + JSON.stringify({fileQuerys:fileQuerys}) , onresolution);
  	   else
  	   {
  	       var resolved_files = [];
           for (var k = 0; k < queue.length;k++)
           {
            	queue[k].URLType = 'foreignurl';   
            	resolved_files[k]  = queue[k].fileID;
           }

           onresolution({resolved_files:resolved_files});

  	   }
  	    
	   function onresolution (result){
			 	var resolved = [];
			 	for (var k = 0; k < result.resolved_files.length;k++)
			 	{
			 		if ( result.resolved_files[k] == "")  // file not present, create file in case
			 		{
			 			if (queue[k].intent && queue[k].intent.defaultform)
			 			{
							 var m = queue[k].fileID.match(/FFilename:\w+/);
							 if (m.length>0)
							 {
							 	queue[k].URLType = 'form';
							 	queue[k].fileID = m[0].substring(10);
							 	resolved.push(queue[k]);
							 }

			 			}
			 			if (queue[k].intent && queue[k].intent.autocreateroi)
			 			{
							 	queue[k].URLType = 'createROI';
							 	queue[k].intendedName = translatepatterntoname(queue[k].fileID)
							 	queue[k].fileID =  queue[queue[k].intent.autocreateroi].fileID;
							 	resolved.push(queue[k]);
			 			}
			 			if (queue[k].intent && queue[k].intent.autocreate_ano)
			 			{
							 	queue[k].URLType = 'createANO';
							 	var pattern = queue[k].fileID;
							 	queue[k].fileID =  queue[k].intent.autocreate_ano;
							 	queue[k].fileID.name = translatepatterntoname(pattern);
							 	resolved.push(queue[k]);

			 			}

			 			function translatepatterntoname(pattern)
			 			{
			 				var subf,name;
							var m = pattern.match(/FFilename:\w+/);
							if (m) // old style
 							{
  			 				    name = m[0].substring(10);
                                var m = pattern.match(/FSubFolder:\w+/);
                                if (m)
                                  subf = m[0].substring(11);

                                if (subf == undefined)
                                    return name;
                                else
                                    return subf +"/"+name;
 							}
 							else // simple spattern style
 							{
                                return pattern.split(" ")[0];

 							}


			 			}
			 			
			 		}
			 		else
			 		{
			 		    if (queue[k].URLType == 'foreignurl')
                        {
                        	var ttfile = result.resolved_files[k]; // might return multi matches
                            queue[k].url = ttfile;
                            queue[k].fileID = ttfile;
                            if (queue[k].intent && queue[k].intent.intendedID)
                                 queue[k].fileID = queue[k].intent.intendedID;

	                        resolved.push(queue[k]);
                        }
                        else
                        {
                           	queue[k].fileID = result.resolved_files[k][0];
	                        resolved.push(queue[k]);

                        	if(queue[k].intent.onmultimatches == 'loadall')
                        	{
                        		var flist = result.resolved_files[k];
                        		for(var j=1; j<flist.length; j++)
                        		{
                        			var newqitem = $.extend(true, {}, queue[k])
									newqitem.fileID = result.resolved_files[k][j];
									newqitem.intent.viewportID = queue[k].intent.viewportID + j;
									resolved.push(newqitem);
                        		}
                        	}
                        }
			 		}
			 	}
			 
			    if (ViewerSettings.calcpanel && ViewerSettings.calcpanel.enabled)
			         resolved.push({fileID:"meta_"+currentPSID.patients_id + currentPSID.studies_id,
			   				URLType:"serverfile", intent:{auto_tag:"pinfo"}})
			    
		        $(document.body).removeClass('wait');

		        KViewer.setViewPortLayout();

			    if (resolved.length > 0)
			    {
				   loadingQueue.execQueue(resolved,function() 
				   {
						if(ViewerSettings.autoloaders) // new version of settings
						{
							KViewer.toggleMainViewport(ViewerSettings.mainViewport,true);
						}
						else
						{
							KViewer.toggleMainViewport(ViewerSettings.viewPortAutoDefaults.mainViewPort,true);
						}

						if (ViewerSettings.calcpanel && ViewerSettings.calcpanel.enabled)
						{
							var autoinput = [];
							var pinfo;
							for (var k = 0;k < queue.length;k++)
							{								
								if (queue[k].obj)
									autoinput[queue[k].intent.auto_tag] = queue[k].obj;
								else
									autoinput[queue[k].intent.auto_tag] = KViewer.dataManager.getFile(queue[k].fileID);
							}
							for (var k = 0;k < loadingQueue.fobjs.length;k++)
							{
								if ( loadingQueue.fobjs[k].filename && loadingQueue.fobjs[k].filename.search("study meta") > -1)
								{
									pinfo = JSON.parse(loadingQueue.fobjs[k].content);
									break;
								}
							}
							KCalcPanel(ViewerSettings.calcpanel,autoinput,pinfo);
						}

						if (callback)
							callback();
				   });
			    }
               else
               {
                    if (callback)
                        callback();

               }

			 }
					  




      function extractDetailsFromClimString(lstr)
      {
            var out = {clim:""};
           	if($.type(lstr) !== "string")
            {
           		out.clim = lstr;
           		return;
           	}
            if (lstr.length > 0)
      			{
      			   if (lstr.search("overlay") != -1)
      			   {
      			   		out.overlay = true;
      			   		lstr = lstr.replace("ovl","").trim();
      			   }
      			   if (lstr.search("GL") != -1)
      			   {
      			   		out.gl = true;
      			   		lstr = lstr.replace("GL","").trim();
      			   }
      			   if (lstr.search("transparent") != -1)
      			   {
      			   		out.transparent = true;
      			   		lstr = lstr.replace("transparent","").trim();
      			   }
      			   for (var k = 0; k < colormap.names.length;k++)
      			   {
      			   		if (lstr.search(colormap.names[k]) != -1)
      			   		{
      			   		 lstr = lstr.replace(colormap.names[k],"").trim();
      						 out.cmap = colormap.names[k];
      			   		}
      			   }
      			   if (lstr.length > 0)  // this is what remains from the clims
      			   {
      				   out.clim = lstr.split(",");
      				   out.clim.forEach(function(part,index,array) { array[index] = parseFloat(part); });
      				   if(out.clim.length != 2 )
      				     	out.clim = "";
      			   }
      			}
            return out;
        }


}





///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Misc stuff
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


DataView.prototype.getUTF8String = function(offset, length) {
    var utf16 = new ArrayBuffer(length * 2);
    var utf16View = new Uint16Array(utf16);
    for (var i = 0; i < length; ++i) {
        utf16View[i] = this.getUint8(offset + i);
    }
    return String.fromCharCode.apply(null , utf16View);
}
;




function webgl_detect()
{
    if (webgl_detect.is != undefined)
        return webgl_detect.is;

    var context;

    if (!!window.WebGLRenderingContext) {
        var canvas = document.createElement("canvas")
          ,
        names = ["webgl", "experimental-webgl", "moz-webgl", "webkit-3d"]
          ,
        context = false;

        for (var i = 0; i < 4; i++) {
            try {
                context = canvas.getContext(names[i]);
                if (context && typeof context.getParameter == "function") {
                    webgl_detect.is = true;
                    return true;
                }
            } catch (e) {}
        }

        // WebGL is supported, but disabled
        webgl_detect.is = false;
        return false;
    }

    // WebGL not supported
    webgl_detect.is = false;
    return false;
}




/***************************************************************************************
*  loading Queue - loads a series of files from server
***************************************************************************************/

/** for loading a series of files from server synchronously 
 * @class */
var loadingQueue =
{
    queue: [],
	/** @function */
    execQueue: function(queue, onready)
    {
        if (queue != undefined)
        {
            loadingQueue.queue = queue.reverse();
            loadingQueue.fobjs = [];
        }

        if (loadingQueue.queue.length == 0)
        {
            if (onready)
                onready(loadingQueue.fobjs);
            return;
        }

        var item = loadingQueue.queue.pop();
        var targetViewer;
        if (item.intent.viewportID != undefined)
            targetViewer = KViewer.viewports[item.intent.viewportID];



        if (item.intent.clim == "")
            item.intent.clim = undefined;


        if (targetViewer == undefined)
        {
            item.callback = function(fobj) {
                loadingQueue.fobjs.push(fobj);
                this.obj = fobj;
                loadingQueue.execQueue(undefined, onready);
            }            
            KViewer.dataManager.loadData(item);
        }
        else
        {
            if (targetViewer.getCurrentViewer() != undefined && targetViewer.getCurrentViewer().viewerType == 'Manager')
                loadingQueue.execQueue(undefined, onready);
            else
                targetViewer.openFile(item, function() {
                    loadingQueue.execQueue(undefined, onready);
                });
        }
    }
};


/***************************************************************************************
*  Full screen related functions
***************************************************************************************/

function isFullScreen()
{
    return (document.fullScreenElement && document.fullScreenElement !== null )
    || document.mozFullScreen
    || document.webkitIsFullScreen;
}

function requestFullScreen(element)
{
    if (element.requestFullscreen)
        element.requestFullscreen();
    else if (element.msRequestFullscreen)
        element.msRequestFullscreen();
    else if (element.mozRequestFullScreen)
        element.mozRequestFullScreen();
    else if (element.webkitRequestFullscreen)
        element.webkitRequestFullscreen();
}

function exitFullScreen()
{
    if (document.exitFullscreen)
        document.exitFullscreen();
    else if (document.msExitFullscreen)
        document.msExitFullscreen();
    else if (document.mozCancelFullScreen)
        document.mozCancelFullScreen();
    else if (document.webkitExitFullscreen)
        document.webkitExitFullscreen();
}




///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Misc
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



function invertObject(obj)
{

    var inv = {};
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++)
    {
        inv[obj[keys[k]]] = keys[k];
    }

    return inv;


}


function patientTableScrollLock($thediv)
{

    // turn off horizontal autoscroll behaviour
    var scleft = $thediv.scrollLeft();
    var scrollock = function(e) {
        $thediv.scrollLeft(scleft);
    }
    var clear = function() {
        $thediv.off('scroll', scrollock);
        $(document.body).off('mouseup', clear);
    }
    ;
    $thediv.on('scroll', scrollock);
    $(document.body).on("mouseup", clear);

}



function permMat(nii)
{
    var P = math.matrix([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1]]);
    for (var i = 0; i < 3; i++)
        P._data[i][nii.permutationOrder[i]] = nii.arrayReadDirection[i] / nii.voxSize[i];
    
    return P;
}

permutationMat = permMat;


function permMat_noscale(nii)
{
    var P = math.matrix([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1]]);
    for (var i = 0; i < 3; i++)
        P._data[i][nii.permutationOrder[i]] = nii.arrayReadDirection[i];
    
    return P;
}



function isIdentity(R)
{
    var eps = 0.001;
    var identity = true;
    for (var k = 0; k < R.length;k++)
    {
        if (Math.abs(R[k][k] - 1) > eps)
        {
            identity = false;
            break;
        }
        for (var j = k+1; j < R.length;j++)
            {
                if (Math.abs(R[j][k]) > eps | Math.abs(R[k][j]) > eps)
                {
                    identity = false;
                    break;
                }
            }
        if (!identity)
            break;
    }

    return identity;
}


function transMat(t)
{
    if (t._data != undefined)
        t = t._data;
    var T = math.matrix(math.diag([1, 1, 1, 1]))._data;
    T[0][3] = t[0];
    T[1][3] = t[1];
    T[2][3] = t[2];
    return T;
}

function applyInvPerm(p,s)
{
    for (var k = 0; k < p.length;k++)
        if (s == p[k])
        {
            return k;            
        }
}


function invert(arr, len)
{
    var r = new Array();
    for (var k = 0; k < len; k++)
    {
        r[k] = k;
    }
    return $(r).not(arr).get();
}



function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}
function RGB2HTML(r, g, b,a) {
    if (a == undefined)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    else
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b) + componentToHex(a);
}



function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})*$/i.exec(hex);
    if (result == null)
        return {
        r: 0,
        g: 0,
        b: 0,
        a: 1
    } ;
    var alpha = 255;
    if (result[4] != undefined)
        alpha = parseInt(result[4], 16);

    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
        a: alpha
    } : null ;
}

function KColorSelector(colorlist, colencode, onchange, obj)
{
    var colors = colorlist;

    function robustcolencode(colidx)
    {
        if (colidx == undefined)
            return colencode([0,0,0])
        if (colidx.length == 3)
            return colencode(colidx)
        else
            return colencode(colors[colidx]);
    }

    var $colselector = $("<div  class='KViewPort_tool KViewPort_tool_cmap fibers' style='" + robustcolencode(obj.color) + ";'>  <i class='fa fa-empty fa-1x'>&nbsp&nbsp&nbsp&nbsp</i></div>");
    var color_response = function(str, ev) 
    {
        if (str!=undefined) 
        {
            obj.color = parseInt(str);
            $colselector.attr('style', colencode(colors[obj.color]));
            var col = colors[obj.color];
            onchange(col,obj.color);
        }
    }
    $colselector.color_response = color_response;

    $colselector.updateColor = function()
    {
        $colselector.attr('style', colencode(colors[obj.color]));
    }

    var color_contextmenu = new KContextMenu(
    function() {
        {
            var $menu = $("<div class='menu_context color_selector'></div>");
            for (var k = 0; k < colors.length; k++)
            {
                var c = colors[k];
                $menu.append($("<div style=' " + colencode(c) + "' onchoice='" + k + "' ><div> </div>  </div>"));
            }
            if (obj.alpha != undefined)
            {
                var $alpha = $("<input onchoice='preventSelection' type='number' step='0.05' min='0' max='1'>").val(obj.alpha).
                on('change', function(ev) {
                    var $input = $(ev.target);
                    obj.alpha = $input.val();
                    onchange();
                });
                $menu.append($("<li  onchoice='preventSelection'> Alpha: </li>").append($alpha));
            }
            if (obj.gamma != undefined)
            {
                var $gamma = $("<input onchoice='preventSelection' type='number' step='0.05' min='0' max='2'>").val(obj.gamma).
                on('change', function(ev) {
                    var $input = $(ev.target);
                    obj.gamma = $input.val();
                    onchange();
                });
                $menu.append($("<li  onchoice='preventSelection'> Gamma: </li>").append($gamma));
            }
            if (obj.exposure != undefined)
            {
                var $exposure = $("<input onchoice='preventSelection' type='number' step='0.05' min='0' max='4'>").val(obj.exposure).
                on('change', function(ev) {
                    var $input = $(ev.target);
                    obj.exposure = parseFloat($input.val());
                    onchange();
                });
                $menu.append($("<li  onchoice='preventSelection'> Exposure: </li>").append($exposure));
            }

            return $menu;
        }
    }
    ,color_response,false,true);
    $colselector.click(color_contextmenu);
    $colselector.themenu = color_contextmenu;

    return $colselector;
}


function KColor(c)
{
    if (Array.isArray(c))
        this.color = c.slice(0);
    else if (typeof c == 'string')
    {
        var tmp = hexToRgb(c);
        if (tmp.a != undefined)
            this.color = [tmp.r,tmp.g,tmp.b,tmp.a];
        else
            this.color = [tmp.r,tmp.g,tmp.b];
    }
    else // and some more, which are not yet implemented
        this.color = c.slice(0);
}

KColor.prototype.getAlpha = function()
{
    if (this.color[3] != undefined)
        return this.color[3]/255;
    else
        return 1;
}


KColor.prototype.getRGBarr = function()
{
    return this.color;
}
KColor.prototype.getHEX = function ()
{
    if (this.color[3] != undefined && this.color[3] != 255)
        return RGB2HTML(this.color[0],this.color[1],this.color[2],this.color[3]);
    else
        return RGB2HTML(this.color[0],this.color[1],this.color[2]);
}
KColor.prototype.getCSS = function()
{
    if (this.color.length == 4)
        return 'rgba(' + this.color.toString() + ')'
    else
        return 'rgb(' + this.color.toString() + ')'
}
KColor.prototype.getOpacity = function()
{
    if (this.color.length == 4)
        return this.color[3]/255;
    else
        return 1;
}
KColor.prototype.getBabylon = function()
{
    return new BABYLON.Color3(this.color[0]/255,this.color[1]/255,this.color[2]/255);
}
KColor.prototype.darken = function(a)
{

        this.color[0] *= a;
        this.color[1] *= a;
        this.color[2] *= a;
        return this;
}
KColor.findColorIndex = function(color)
{
    var retcolor = 0;
    for(var k=0; k< KViewer.roiTool.colors.length; k++)
    {
        var cc = KViewer.roiTool.colors[k];
        var found = true;
        for(var j=0; j< cc.length; j++)
            if(cc[j] != color[j])
                found = false;

        if(found)	
        {
            retcolor = k;
            break;
        }    			
    }
    return retcolor;
}

 
KColor.list =[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255],[255,128,0],[255,0,128],[128,255,128],[0,128,255],[128,128,128],[185,170,155]];

function KColorSelectorSimple($selectordiv, onchange, obj)
{
    var clist = KColor.list;
    var colors = [];
    for (var k = 0; k < clist.length; k++)
        colors[k] = new KColor(clist[k]);

    // return the color list only on request
    if ($selectordiv === 'getcolors')
        return colors;

    if(obj.color instanceof KColor)
        $selectordiv.css('background', obj.color.getCSS());
    else
        $selectordiv.css('background', (new KColor(KColor.list[obj.color])).getCSS() );
      
    

    var color_response = function(k)
    {
        if (k == undefined)
            return;
        var color = colors[parseInt(k)];
        
        $selectordiv.css('background', color.getCSS() );
        //$selectordiv.css('background', (new KColor(color)).getCSS());
        
        onchange(color)
    }
    $selectordiv.color_response = color_response;

    var color_contextmenu = new KContextMenu(
    function() {
        {
            var $menu = $("<div class='menu_context color_selector'></div>");
            for (var k = 0; k < colors.length; k++)
            {
                $menu.append($("<div style='background:" + colors[k].getCSS() + "' onchoice='" + k + "' ><div></div>  </div>"));
            }
            return $menu;
        }
    }
    ,color_response);

    $selectordiv.click(color_contextmenu);

    return $selectordiv;
}








/***************************************************************************************
*  logout
****************************************************************************************/
function logout()
{
    clearTimeout(updatePatientTimerID);
    // beforeunload is called automatically -> save state;
    var url = myownurl();
    if (url[url.length - 1] == '#')
        url = url.substring(0, url.length - 1);
    window.location.link_was_clicked = true;

    if(projectInfo != undefined && projectInfo.name != undefined)
        window.location.href = url + "?logout&project="+projectInfo.name;
    else
        window.location.href = url + "?logout";

}

function login()
{
    logout();
}


/***************************************************************************************
*  dicom upload
***************************************************************************************/

var dicomupload = function(e) {
    for (var k = 0; k < this.files.length; k++)
    {
        var file = this.files[k];
        var parts = file.name.split('.');
        var ext = parts[parts.length - 1];
        var recognized = false;
        switch (ext.toLowerCase()) {
        case 'gz':
        case 'tgz':
        case 'zip':
        case 'tar':
            recognized = true;
        }

        if (!recognized)
            $.notify("file type not accepted: " + file.name + ". Accepted types are gz,tgz,zip,tar! ", "error")
        else
        {
            var xhr = new XMLHttpRequest();
            var formData = new FormData();
            formData.append("thefile", file);
            var notiid = "x" + Math.floor((Math.random() * 1000000000000));
            $.notify(file.name + " upload started", {
                autoHide: false,
                className: "info " + notiid
            })

            xhr.upload.addEventListener('progress', function(name, id) {
                return function(e) {
                    //console.log("progress" + Math.ceil(e.loaded/e.total * 100 )+ '%');
                    $("." + id).text(name + " upload in progress " + +Math.ceil(e.loaded / e.total * 100) + '%');
                }
            }(file.name, notiid), false);


            xhr.open('post', myownurl() + '?asuser=' + userinfo.username + "&project=" + projectInfo.name);
            xhr.send(formData);
            xhr.onload = function(name, id) {
                return function(e)
                {
                    $("." + id).remove();
                    try {
                        var response = JSON.parse(this.response);
                        if (response.success != 1)
                            $.notify("error during upload: " + response.msg, "error");
                        else
                            $.notify(name + " successfully uploaded, import started!", "success");
                    }
                    catch (err)
                    {
                        $.notify("error during upload, file above 1GB limit?!", "error");

                    }

                }
            }(file.name, notiid);
        }

    }
    this.value = null ;
    // otherwise onchange is only triggered if file really changes
}
;






///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Signal Handler
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////




function SignalHandler()
{
    var that = new Object()
    var signal = new Object();
    var sigmap = new Object();

    that.signal = signal;
    that.rid = 0;
    function send(sigs, event, preferredID)
    {
        sigs = sigs.split(" ");
        
        for (var k = 0; k < sigs.length; k++)
        {
            var s = signal[sigs[k]];
            if (s != undefined)
            {
                if (preferredID != undefined)
                {
                    for (var i = 0; i < s.length; i++)
                        if (s[i].id == preferredID)
                        {
                           var ev = $.extend({preferred:true},event);
                           s[i].handler(ev);
                           break;
                        }
                    for (var i = 0; i < s.length; i++)
                        if (s[i].id != preferredID)
                        {
                           var ev = $.extend({preferred:false},event);
                           s[i].handler(ev);
                        }

                }
                else
                {
                    for (var i = 0; i < s.length; i++)
                        s[i].handler(event);
                }
            }
        }

    }
    function attach(sig, handler)
    {
        if (signal[sig] == undefined)
            signal[sig] = new Array();
        signal[sig].push({
            id: that.rid,
            handler: handler
        });
        that.rid++;
        return that.rid - 1;
    }

    function detach(sig, id)
    {
        var s = signal[sig];
        for (var i = 0; i < s.length; i++)
            if (s[i].id == id | id == "all")
            {
                s.splice(i, 1);
                break;
            }
    }

    function detachByIdList(idlist)
    {
        for (var k = 0; k < idlist.length; k++)
        {
            // stupid, must try and run over all signals if only id is known...
            for (var tsig in signal)
            {
                detach(tsig, idlist[k])
            }
        }
    }


    that.send = send;
    that.attach = attach;
    that.detach = detach;
    that.detachByIdList = detachByIdList;

    return that;
}


function buildDragImg(ev)
{
    var dragtxt = "";

    if (ev.toolDragDrop)
        dragtxt = ev.toolDragDrop;
    else
    {
        for (var k = 0; k < tempObjectInfo.length; k++)
        {
            if (tempObjectInfo[k].type == 'file' | tempObjectInfo[k].type == 'subfolder')
                dragtxt += tempObjectInfo[k].filename + "<br>";
            else if (tempObjectInfo[k].type == 'patient')
                dragtxt += tempObjectInfo[k].piz + "<br>";
            else if (tempObjectInfo[k].type == 'study')
                dragtxt += tempObjectInfo[k].filename + "<br>";
            else if (tempObjectInfo[k].type == 'markertemplate')
                return false;
            else if (tempObjectInfo[k].type == 'tagpaneltag')
                return false;
        }
        if (dragtxt == "")
            dragtxt = "?????";
        else
            dragtxt = dragtxt.substring(0, dragtxt.length - 4);
    }

    if (ev.originalEvent)
        ev = ev.originalEvent;
    
    var crt = $("<div id='dragimg' >" + dragtxt + " </div>").get(0);
    document.body.appendChild(crt);
    if (ev.dataTransfer != undefined)
    {
        ev.dataTransfer.setDragImage(crt, 0, 0);
        setTimeout(function() {
            $("#dragimg").remove() },10 )
    }
  //  $("#dragimg").hide();

}


function buildDragBox(ev, $source, $dragger)
{
    var $frame = $("<div class='dragbox'></div>");
    $frame.width($source.width());
    $frame.height($source.height());
    $frame.offset($source.offset());
    var startoffs = $source.offset();
    var startpos = [ev.originalEvent.clientX, ev.originalEvent.clientY];

    function mmove(ev2)
    {
        $frame.offset({
            left: startoffs.left + (ev2.originalEvent.clientX - startpos[0]),
            top: startoffs.top + (ev2.originalEvent.clientY - startpos[1])
        });
    }

    $dragger.on("drag", mmove);
    $dragger.on("dragend", function(ev)
    {
        $frame.remove();
        $dragger.off('drag');
    })

    $frame.appendTo(document.body);
}


function dragstarter(info)
{
    return function(ev)
    {
        tempObjectInfo = {
            type: '',
            sid: '',
            piz: '',
            subfolder: '',
            tag: '',
            mime: '',
            filename: '',
            fileID: ''
        };
        var the_info;
        if (typeof (info) == 'function')
            the_info = info();
        else
            the_info = info;
        tempObjectInfo = [$.extend(tempObjectInfo, the_info)];
        if (ev.originalEvent != undefined)
            ev = ev.originalEvent;

        if (ev.dataTransfer != undefined)
            ev.dataTransfer.setData("fromfiletable", "yea");
        tempObjectInfo.shiftKey = ev.shiftKey;

        buildDragImg(ev);
    }
    ;
}



function detectmob() {
    if (navigator.userAgent.match(/Android/i)
    || navigator.userAgent.match(/webOS/i)
    || navigator.userAgent.match(/iPhone/i)
    || navigator.userAgent.match(/iPad/i)
    || navigator.userAgent.match(/iPod/i)
    || navigator.userAgent.match(/BlackBerry/i)
    || navigator.userAgent.match(/Windows Phone/i)
    ) {
        return true;
    }
    else {
        return false;
    }
}


function allocateLocalstorage(done)
{

    // Specify desired capacity in bytes
    var desiredCapacity = 1024 * 1024 * state.project_user.localstoragesizeMB;

    try {
        if (desiredCapacity > 0)
        {

            storage = new LargeLocalStorage({
                size: desiredCapacity,
                name: 'myDb'
            });

            // Await initialization of the storage area
            storage.initialized.then(function(grantedCapacity) {
                // Some browsers don't indicate how much space was granted in which case
                // grantedCapacity will be 1.
                if (grantedCapacity.getCapacity() == -1)
                {
                    console.log("no local storage available!!");
                    storage = undefined;
                }

                if (done != undefined)
                    done();
            }).catch(function()
            {
                console.log("no local storage available!!");
                storage = undefined;
                if (done != undefined)
                    done();
            });

            storage.rmOld = function(cb, sz)
            {
                function findOldest(objs)
                {
                    var time = Object.keys(objs);
                    time.sort();
                    var sum = 0;
                    var todel = [];
                    for (var k = 0; k < time.length; k++)
                    {
                        sum += objs[time[k]].filesize;
                        todel.push(objs[time[k]].docid);
                        if (sum > sz)
                            break;
                    }

                    var fun = function() {
                        storage.rm(todel[0]).then(function() {
                            if (todel.length > 0)
                            {
                                todel.splice(0, 1);
                                fun();
                            }
                            else
                            {
                                cb();
                            }
                        })
                    }
                    ;
                    fun();


                }

                storage.ls().then(function(docKeys) {
                    var objs = {};
                    var fun = function() {
                        storage.getContents(docKeys[0]).then(
                        function(content)
                        {
                            if (docKeys.length > 0)
                            {
                                if (content != "")
                                {
                                    var finfo = JSON.parse(content);
                                    finfo.docid = docKeys[0];
                                    objs[finfo.timeOfInsertion] = finfo;
                                }
                                docKeys.splice(0, 1);
                                fun();
                            }
                            else
                            {
                                findOldest(objs);
                            }
                        })
                    }
                    ;
                    fun();
                })
            }




        }
        else
        {
            storage = undefined;
            if (done != undefined)
                done();
        }
    }
    catch (e)
    {
        storage = undefined;
        if (done != undefined)
            done();

    }
}


function toArray(list) {
    return Array.prototype.slice.call(list || [], 0);
}


function readBufferFromFile(reader, ev)
{
    // the file is already loaded (e.g converted from dicoms)
    // workaround: continue the pipeline and give the file reader the corresponding buffer


    if (ev.constructor && ev.constructor.name == 'Blob') // if you give a blob
    {
        reader.readAsArrayBuffer(ev);
    }
    else if (ev.file === undefined && ev.buffer != undefined) // this bypasses loading for already loaded buffers
    {
        reader.customBuffer = ev.buffer;
        if (reader.onload)
            reader.onload(ev);
        if (reader.onloadend)
            reader.onloadend(ev);
    }
    // firefox behaves very differently here. Observed [object FileEntry], [object FilySystemFileEntry], [object File]
    // maybe ev.file.isFile is more universal
    //else if (ev.file.toString() == "[object FileEntry]")
    else if (ev.file.isFile)
    {
        ev.file.file(function(f) {
            ev.file = f;
            reader.readAsArrayBuffer(ev.file);
        });
    }
    else if (ev.file.local)
    {
        //if (reader.onprogress)  // unfortunately no onprogress in fs.readFiles
        //    reader.onprogress({total:1,loaded:0.5});
        
        fs.readFile(ev.file.name,function(err,data){
            if (data == undefined)
            {
                reader.onerror();
            }
            else
            {
                reader.customBuffer = data;

                if (reader.onload)
                    reader.onload(ev);
                if (reader.onloadend)
                    reader.onloadend(ev);
            }
        });
        
    }
    else if (ev.file.compressionMethod != undefined)
    {
        ev.file.getData(new zip.BlobWriter(), function(blob)
        {
            // text contains the entry data as a String
            var old = reader.onload;
            reader.onload = function(e) {
                ev.progressSpinner();
                if (old)
                    old(e)
            }
            ;
            reader.readAsArrayBuffer(blob);

        }, function(current, total)
        {
            ev.progressSpinner("unzipping " + math.round(current / total * 100) + "%");
        });
    }
    else
        reader.readAsArrayBuffer(ev.file);

}










// ======================================================================================
// ======================================================================================
// ============= upload functions
// ======================================================================================
// ======================================================================================



function extendWithUniquePSID(finfo)
{

    // if no psid ist set ...
    if (finfo.patients_id == "undefined" | finfo.studies_id == "undefined" | finfo.patients_id == undefined | finfo.studies_id == undefined)
    {

        cPSID = patientTableMirror.getCurrentUniquePSID();
        if (cPSID === false && userinfo.username != guestuser)
        {
            $.notify("Error: You have to select/expand a unique study for upload!", "error");
            return false;
        }
        else
        {
            finfo = $.extend(finfo, cPSID);
        }
    }
    return finfo;
}




uploadJSON.askonOverwrite = true;
uploadJSON.quiet = false;
function uploadJSON(name, content, finfoextension, onsuccess)
{

    var out = new Object();
    out.name = name;

    // create a fileinfo to add to db
    out = $.extend(out, finfoextension);

    var tag = "";
    if (out.tag)
        tag = out.tag;
    if (tag[0] != '/')
        tag = "/" + tag;
    if (tag[tag.length - 1] != '/')
        tag = tag + "/";


    function appendExtension(stag, ext)
    {
        if (tag.search("/" + stag + "/") != -1)
        {
            if (out.name.search("\\." + ext) == -1)
            {
                out.name = out.name.replace('.json', '');
                out.name = out.name + "." + ext + ".json";
            }
        }
    }

    appendExtension("FORM", "form");
    appendExtension("ANO", "ano");
    appendExtension("RO", "transform");
    appendExtension("TCKSEL", "tck");


    if (!electron)
    {
        out = extendWithUniquePSID(out);
            
        if (out.piz == undefined || out.study == undefined)
        {

            if (out == false)
                return;

            out.piz = out.patients_id;
            out.study = out.studies_id;
        }

        if (out.study == undefined && userinfo.username != guestuser)
        {
            alertify.error("please select a unique study to upload!")
            return;
        }
    }


    out.content = content

    if (uploadJSON.askonOverwrite && $('#patientTable').find("tr[data-piz='" + out.piz + "'][data-sid='" + out.study + "'][data-subfolder='" + out.subfolder + "'][data-filename='" + out.name + "']").length > 0)
    {
        alertify.prompt('The file `' + out.subfolder + '/' + out.name + '` already exists for this study. Overwrite?', function(e, str)
        {
            out.name = str;
            if (e)
                saveit()
        }, out.name);
        return;
    }
    else
        saveit();

    function saveit()
    {



        var json = JSON.stringify(out);

        var public_save_allowed = (static_info && static_info.public_projects);
        
        if ( (userinfo.username == guestuser || electron) && !public_save_allowed)
        {
            var blob = new Blob([json],{
                type: "octet/stream"
            });
            saveBlob(blob, {filename:out.name} );
            if (onsuccess)
                onsuccess();

        }
        else
            ajaxRequest('command=save_json&json=' + encodeURIComponent(json), function(e)
            {
                if (!uploadJSON.quiet)
                    $.notify(out.piz + out.study + " " + out.name + " saved.", "success");
                if (e.fileID == undefined)
                {
                    patientTableMirror.mirrorState();     
                    if (onsuccess)           
                        onsuccess(undefined,out)
                    return;
                }
                var fobj = KViewer.dataManager.getFile(e.fileID);
                if (fobj == undefined)
                {
                    fobj = {
                        contentType: 'json',
                        fileID: e.fileID,
                        filename: out.name,
                        fileinfo: out,
                        content: {
                            content: out.content
                        }
                    };
                    if (out.tag != undefined && out.tag.search("TCKSEL") == -1)
                        KViewer.dataManager.setFile(e.fileID, fobj);
                }

                patientTableMirror.mirrorState();
                signalhandler.send("updateInfoBar");
                if (onsuccess)
                    onsuccess(fobj,out);
            });
    }


}


function str2ab(str) {
    var buf = new ArrayBuffer(str.length);
    // 2 bytes for each char
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

function uploadBinary(fobj, finfoextension, onsaved, progress, zip, usenativePID)
{

    // create a fileinfo to add to db
    var finfo = $.extend(true, fobj.fileinfo, finfoextension);
    delete finfo.ID;


    if (usenativePID)
    {
        if (finfo.patients_id == undefined || finfo.studies_id == undefined)
        {
            alertify.error("No PID/SID assigned to " + fobj.filename + ", cannot upload!");
            return;
        }
        finfo.usenativePID = true;
    }
    else
    {
        var backup_pid = finfo.patients_id;
        var backup_sid = finfo.studies_id;
        delete finfo.patients_id;
        delete finfo.studies_id;
        if (extendWithUniquePSID(finfo) == false)
        {
            finfo.patients_id = backup_pid;
            finfo.studies_id = backup_sid;
            return;
        }
    }


    finfo.Filename = fobj.filename;
    if (fobj.contentType == 'nii')
    {
        if (fobj.filename.search("\\.nii") == -1)
        {
            if (fobj.notzipped == undefined | !fobj.notzipped)
                finfo.Filename = fobj.filename + ".nii.gz";
            else
                finfo.Filename = fobj.filename + ".nii";
        }      
    }


    if (zip == undefined)
        zip = true;

    var exts = ['json', 'txt', 'jpeg', 'jpg', 'png', 'bmp', 'txt', 'bvec', 'bval','bmat', 'mgh'];
    for (var j = 0; j < exts.length; j++)
        zip = zip & finfo.Filename.search("\\." + exts[j]) == -1;

    var alreadyZipped = finfo.Filename.search("\\.gz") != -1 || finfo.Filename.search("\\.mgz") != -1

    if (fobj.modified)
        // if this upload originates from local changes, keep the zip state
        zip = alreadyZipped;



    if (zip & !alreadyZipped)
        finfo.Filename += ".gz";


    if (!zip & alreadyZipped)
        finfo.Filename = finfo.Filename.replace('.gz', '');

    if (finfo.FilePath)
        finfo.FilePath = finfo.FilePath.substring(0, finfo.FilePath.lastIndexOf("/")) + "/" + finfo.Filename;
    else
        finfo.FilePath = "";
    //build filepath on php side

    if (progress)
        progress('packing ' + fobj.filename);


    finfo.Filename = finfo.Filename.trim();

    if (finfo.SubFolder == undefined)
        finfo.SubFolder = "";

    if (0)
        setTimeout(function() {
            executeUpload({
                fobj: fobj,
                zip: zip,
                alreadyZipped: alreadyZipped,
                finfo: finfo,
                progress: progress,
                onsaved: onsaved
            });
        }, 10);
    else
    {
        var obj = {
            fileID: fobj.fileID,
            userinfo: userinfo,
            projectInfo: projectInfo,
            myownurl: myownurl(),
            zip: zip,
            alreadyZipped: alreadyZipped,
            finfo: finfo
        };

        if (fobj.fileID.substring(0, 5) != 'proxy')
        {
            obj.buffer = fobj.content.buffer;
            if (fobj.content.buffer != undefined)
                obj.buffer = fobj.content.buffer;
            else            
            {
                if (typeof fobj.content == "object")
                   obj.buffer = str2ab(JSON.stringify(fobj.content));
                else
                   obj.buffer = str2ab(fobj.content);
            }

            obj.deflate = zip;
            obj.inflate = false;
            executeUploadWorker(obj, progress, onsaved);
        }
        else
        {
            var reader = new FileReader();
            reader.onload = function(e) {
                obj.buffer = reader.result;
                obj.deflate = zip & !alreadyZipped;
                obj.inflate = !zip & alreadyZipped;
                executeUploadWorker(obj, progress, onsaved);
            }
            readBufferFromFile(reader, fobj.proxyev)
        }

        return true;
    }


}

function executeUploadWorker(obj, progress, onsaved)
{


    var scriptname = 'KuploadWorker.js' + '?' +  static_info.softwareversion;;
    if (typeof url_pref != "undefined")
       scriptname = url_pref + scriptname;
    
    var worker = new Worker(scriptname);

    worker.addEventListener('message', function(e) {
        e = e.data;
        if (e.msg == 'done')
        {
            progress();

            try
            {
                var response = JSON.parse(e.response);
            }
            catch (err)
            {
                alertify.alert("ERROR: The returned data was not in JSON format\n\n " + err + "\n" + "<textarea style='width:400px;height:500px'>" + e.response + "</textarea>");
                return false;
            }

            if (response.success != 1)
                alertify.error("error during upload: " + response.msg, "error");
            else
                onsaved(obj.fileID, response);
        }
        else if (e.msg == 'warning')
        {
            progress();
            alertify.error("error during upload: " + e.err);
        }
        else
            progress(e.msg);
    }, false);

    // we need to clean the obj for cloning
    var savegl;
    if (obj.finfo.surfreference)
    {
        savegl = obj.surfreference;
        obj.finfo.surfreference = undefined;
    }
    var saveupdate;
    if (obj.userinfo.update)
    {
        saveupdate = obj.userinfo.update;
        obj.userinfo.update = undefined;
    }

    worker.postMessage(obj);
    // Send data to our worker.

    // reestablish cleaned props
    if (savegl)
        obj.finfo.surfreference = savegl;
    if (saveupdate)
        obj.userinfo.update = saveupdate;
}

function saveNiftilocal(fobj)
{
    var zipped = false;


    if (fobj.contentType == 'nii')
    {
        if (fobj.filename.search("\\.nii") == -1)
            fobj.filename = fobj.filename + ".nii";
    }

    // pack the file as blob
    var x = new Uint8Array(fobj.content.buffer);
    if (zipped)
    {
        x = pako.gzip(x);
        if (fobj.filename.search("\\.gz") == -1)
            fobj.filename += ".gz";
    }
    else
    {
        fobj.filename = fobj.filename.replace(".gz", "");
    }
    var blob = new Blob([x],{
        type: 'application/octet-binary'
    });

    
    saveBlob(blob, fobj);
    KViewer.cacheManager.update();

}




function saveBlob_electron(blob, fobj)
{
        if (fobj.fileinfo == undefined)
            fobj.fileinfo = {};
        

        if (fobj.fileinfo.SubFolder == undefined)
            fobj.fileinfo.SubFolder = defaultOpenPath;

        var res = dialog.showSaveDialog({ title: 'save file',
							properties: [],
							defaultPath: fobj.fileinfo.SubFolder + "/" + fobj.filename
						})
        if (res.then)
            res.then(saveit)
        else
            saveit(res);


		function saveit(savename)
						{
                          if (savename.filePath)
                             savename =savename.filePath;

						  if (savename == undefined)
						      return;

						  savename = savename.replace(/\\/g,"/");
						  if (path.extname(savename) == "")
						      savename = savename + path.extname(fobj.filename);


                          var fileReader = new FileReader()

                          fileReader.onload = function(event) {

                            var buffer = Buffer.from(event.target.result);
                            try {
                                if (fobj.contentType != "nii")
                                {
                                    var obj = JSON.parse(Buffer.from(event.target.result).toString('utf8'));
                                    if (obj.tag == 'workstate')
                                    {
                                        var content = obj.content;
                                        var wspath = path.dirname(savename);
                                        for (var k = 0; k < content.viewports.length;k++)
                                            content.viewports[k].fileID  = path.relative(wspath, content.viewports[k].fileID);
                                        buffer = JSON.stringify(obj);

                                    }
                                }

                            } catch(err) {}



						     fs.writeFile( savename, buffer,undefined,function(err)
						     { 
                                    alertify.success('successfully saved ' + savename);
                                    defaultOpenPath = fobj.fileinfo.SubFolder;
						     });
                          };
                          fileReader.readAsArrayBuffer(blob);
						}
     
}






function saveBlob(blob, fobj)
{
    if (electron)
    {
        saveBlob_electron(blob,fobj);
    }
    else
    {
        var filename = fobj.filename;
        // initiate download
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        var event = document.createEvent('MouseEvents');
        event.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null );
        link.dispatchEvent(event);
    }
}


function saveScreenShot(blob, finfo, type, download)
{
    var defname = this.defaultname;

    alertify.prompt("Please enter a name", function(e, name) {
        if (e)
        {
            this.defaultname = name;
            // create a nice file name with increasing numbers, so we have at least some unique id
            var filename = name == "" ? "screenshot" : name;
            var list = $('#patientTable').find("tbody").find(".fileRow[data-subfolder=screenshots]");
            seriesnumber = 1;
            if (list.length > 0)
            {
                list.each(function(k, e) {
                    var a = $(e).attr('data-filename').match(/(\d+)\..*/);
                    list[k] = a === null ? null : a[1];
                });
                seriesnumber = Math.max.apply(null , list) + 1;
            }
            // pad with 3 zeros
            seriesnumber = ("0000" + seriesnumber);
            seriesnumber = seriesnumber.substr(seriesnumber.length - 3);
            if (type == undefined)
                type = '.png';
            filename += ("_" + seriesnumber + type);

            var fobj = {
                fileID: 'proxy',
                buffer: 0,
                filename: filename,
                fileinfo: {
                    patients_id: finfo.patients_id,
                    studies_id: finfo.studies_id,
                    SubFolder: 'screenshots'
                },
                proxyev: blob
            };

            if (userinfo.username == guestuser || download)
            {
                saveBlob(fobj.proxyev, fobj);
            }
            else
                uploadBinary(fobj, {}, function(e) {
                    KViewer.progressSpinner();
                    patientTableMirror.mirrorState();
                    // updates study contents and keeps tree state
                }, KViewer.progressSpinner, false)
        }
    },defname);

}


  


KPanel.currentPanels = {};
function KPanel($target, id, title)
{
    var panel = {visible:true};

    KPanel.currentPanels[id] = panel;

    $('div[id="'+id+'"]').remove();
    var $container = $("<div id='" + id + "' class='panel_floatable roiTool_panel panel' ></div>");
    $container.appendTo($target);

    panel.$container = $container
    panel.show = function()
    {
        panel.visible = true;
        $container.show();

    }



    panel.close =function()
    {
        if (panel.visible)
        {
            panel.hide();
            if (panel.customClose)
                panel.customClose(panel);
        }
    }

    panel.hide = function()
    {
        panel.visible = false;
        $container.hide();
    }

    panel.toggle = function()
    {
        if (!panel.visible)
            panel.show();
        else
            panel.hide();
    }

    panel.$spinner = $("<div class='KViewPort_spinner' ><i class='fa fa-spinner fa-spin'></i> <span >Loading</span></div>").appendTo(panel.$container);
    /** spinner callback for this tool (see {@link module:MiscFunctions~theSpinner}) */
    panel.progressSpinner = theSpinner(panel.$spinner);
    panel.hideSpinner = function() {  panel.$spinner.hide(); }

   
    // ----------- the top Row

    var $topRow = $("<div class='panel_toprow roiTool_panel_flex persistent '></div>").appendTo($container);
    panel.$topRow = $topRow;
    $mover = $("<i class='KViewPort_tool fa fa-hand-paper-o '></i>");
    var $caption = $("<span>" + title + "</span>");
    var $close = $("<i class='KViewPort_tool panel_toprow fa fa-close'></i>").click(
      function() { if (panel.closeOnHide)
                        panel.close()
                   else
                        panel.hide() } );
    $topRow.append($caption).append($("<i class='flexspacer'></i>")).append($close);


    $container.css('left',100);
    $topRow.mousedown(function(ev) {
        var starDiffX = -ev.clientX + parseInt($container.css('left'));
        var starDiffY = ev.clientY - parseInt($container.css('top'));
        $(document.body).mousemove(function(ev)
        {
            var dx = starDiffX + ev.clientX;
            //if (dx > 0)
            {
              //  dx = dx < 10 ? 0 : dx;
                $container.css('left', dx);
            }
            var dy = -starDiffY + ev.clientY;
            if (dy > 0)
                $container.css('top', dy);
        });
        $(document.body).on('mouseup mouseleave', function(ev) {
            $(this).off('mousemove');
        });

    });

    return panel;


}


var ironSight = {

    visible:false,

    isVisible:function() {
            return (ironSight.panel && ironSight.panel.visible) ;
        },

    toggle: function()
    {
        if (ironSight.panel)
        {
            ironSight.visible = !ironSight.visible;
            ironSight.panel.toggle();
        }
        else
        {
            ironSight.createPanel();
            ironSight.visible = true;
        }
    },




    save: function()
    {

        alertify.prompt("Enter a name:", function(e,name)
        {
            if (e)
            {
                 var s = {
                   elec_La: ironSight.input.elec_La.getVal(),
                   elec_Ra: ironSight.input.elec_Ra.getVal(),
                   elec_Lp: ironSight.input.elec_Lp.getVal(),
                   elec_Rp: ironSight.input.elec_Rp.getVal(),
                   ear_R:ironSight.input.ear_R.getVal(),
                   ear_L:ironSight.input.ear_L.getVal() };
                uploadJSON(name,s,{subfolder:'ironsight',tag:'ironsight'},function(){});					
            }
        } ,"ironsight_state");

    },

    import: function(s)
    {
        ironSight.input.ear_L.setVal(s.ear_L);
        ironSight.input.ear_R.setVal(s.ear_R);
        ironSight.input.elec_La.setVal(s.elec_La);
        ironSight.input.elec_Ra.setVal(s.elec_Ra);
        ironSight.input.elec_Lp.setVal(s.elec_Lp);
        ironSight.input.elec_Rp.setVal(s.elec_Rp);
    },
   


    createPanel: function()
    {

        var panel = KPanel($(document.body), "ironSight", "ironSight");
        ironSight.panel = panel;

        panel.$container.width(400)
        var $fileRow = $("<div class='roiTool_panel_flex_persistent'></div>").appendTo(panel.$container);
        var $start = $("<div class='ironsight_title'><span>3D x-ray based visualization of directional deep brain stimulation lead orientation. </span></div>")

        $fileRow.append($start).append($("<i class='flexspacer'></i>"));
        ironSight.$progress = $(" <span>  </span>").appendTo($fileRow);

        $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);
        $('<object  id="brainpicto" type="image/svg+xml" data="ironsight.svg"></object>').appendTo(panel.$container);


        var current_input;
        signalhandler.attach("positionChange",function()
        {

            if (current_input != undefined)
            {
                current_input.trigger_get_click();
            }
        });

     
        var picto = document.getElementById('brainpicto').contentDocument        



        var left_ear = 0;
        var right_ear = 0;

        function sliceToAngle(a)
        {
            return (parseFloat(a)-left_ear)/(right_ear-left_ear)*180 -90;
        }

        function angleToSlice(a)
        {
            return a/delta  + offset;
        }

        function takeVal($input,fun)
        {
           return function() {
            var p = 0;
            var vp = KViewer.viewports[p];
            var mv = vp.getCurrentViewer()
            if (mv == undefined)
                {
                    //alertify.error('load the MIP into viewport')
                    return;
                }
            var v = mv.getCurrenVoxel()._data
            var val = (v[2]);
            $input.val(val); 
            if (fun)
                fun(val);
            update();
             }
        }

        function setVal($input,fun)
        {
           return function() {
            if ($input.val() == "")
                return;
            var p = 0;
            var vp = KViewer.viewports[p];
            var mv = vp.getCurrentViewer()
            if (mv == undefined)
                {
                  //  alertify.error('load the MIP into viewport')
                    return;
                }
            mv.setSlicePos(2,parseFloat($input.val()));
            
             }
        }

        function helpertext(type)
        {
            if (type == "leftear")
            {
                return "define the angle system by finding the direction where the ear canals overlap while looking from the <b>left</b> side of the head."
            }
            if (type == "rightear")
            {
                return "define the angle system by finding the direction where the ear canals overlap while looking from the <b>right</b> side of the head."
            }
            if (type == "eal")
            {
                return "find the direction where the ironsight sign is visible for the left elctrode while looking from the left";
            }
            if (type == "epl")
            {
                return "find the direction where the ironsight sign is visible for the left elctrode while looking from the right (depending on coverage this is most of the times not possible)";
            }
            else
                return "helper " + type;
        }



        function update()
        {

            var eal =  $elec_La.update();
            var ear =  $elec_Ra.update();
            var epl = $elec_Lp.update();
            var epr = $elec_Rp.update();
            return;

        }

        function updateAngle()
        {
            var p = 0;
            var vp = KViewer.viewports[p];
            var mv = vp.getCurrentViewer()
            if (mv == undefined)
                {
                    return;
                }
            var v = mv.getCurrenVoxel()._data
            var val = sliceToAngle(v[2]).toFixed(1);
            $(panel.$angle0[1]).text(val );
        }

        var widinput = 50;
        var widspan = 200;

        function setSVGtext(id,txt)
        {
            var x = document.getElementById('brainpicto').contentDocument
            if (x == undefined)
                return
            x = x.getElementById(id)
            if (x == undefined)
                return
            x = x.children[0];
            x.textContent = txt;
            

        }

        function setArrowDir(id,angle)        
        {
            if (isNaN(angle))
                return;

            var x = document.getElementById('brainpicto').contentDocument
        
            x = x.getElementById(id)
            $(x).css('opacity',1)
            var dir = x.getAttribute("d").split(" ");
            var r = 30;
            x.setAttribute("d","m " + dir[1] + " " + Math.cos(angle/180*Math.PI)*r + "," + Math.sin(angle/180*Math.PI)*r);

        }


        function setAMarker(angle)        
        {
            if (isNaN(angle))
                return;

            var x = document.getElementById('brainpicto').contentDocument
        
            x = x.getElementById("AMARKER")
            if (x==null)
                return;
            $(x).css('opacity',1)
            var dir = x.getAttribute("d").split(" ");
            var r = 125;
            x.setAttribute("d","m " + dir[1] + " " + Math.cos(angle/180*Math.PI)*r + "," + Math.sin(angle/180*Math.PI)*r);

        }


        function input_field(txt,onchange,type)
        {


            var $div0 = $("<div class='inputrow roiTool_panel_flex'></div>").appendTo(panel.$container);
            var $input = $(" <span  style='width:"+widspan+"px;' > "+txt+" </span><input  style='width:"+widinput+"px;' type = 'number'/> ").appendTo($div0);

            $div0.click(function(e)
            {   
                e.preventDefault();
                panel.$container.find(".current_input").removeClass("current_input");
                panel.$container.find(".ironsight_done").hide();
                $(this).addClass("current_input");
                $(this).find(".ironsight_done").show();
                current_input = $div0;
                $div0.trigger_set_click();
                $div0.update();
                $helper.find("span").html(helpertext(type));

            }
            );

            $div0.update = function()
            {
               var angle = sliceToAngle($($input[1]).val());

               if (type == 'eal')
               {
                  angle = angle+90;
                  setSVGtext("texteal",angle.toFixed(0) + "°");
                  setArrowDir("patheal",angle);
               }
               if (type == 'ear')
               {
                  angle = angle-90;
                  setSVGtext("textear",angle.toFixed(0) + "°");
                  setArrowDir("pathear",angle);
               }

               if (type == 'epl')
               {
                  angle = angle-90;
                  setSVGtext("textepl",angle.toFixed(0) + "°");
                  setArrowDir("pathepl",angle);
               }
               if (type == 'epr')
               {
                  angle = angle+90;
                  setArrowDir("pathepr",angle);
                  setSVGtext("textepr",angle.toFixed(0) + "°");
               }


               var str = angle.toFixed() + "°";
               $angle.text(str);     

               return angle + "/ slice=" + $($input[1]).val();
            }

            $div0.onchange = function() {

               if (onchange)
                onchange($($input[1]).val())

               $div0.update();

               update()

            }
               
            $div0.getVal = function()
            {
                return {slice: $($input[1]).val(), angle:$angle.text()};
            }

            $div0.setVal = function(s)
            {
                 if (s == undefined)
                 {
                     $($input[1]).val("");
                     $div0.onchange();
                     update();

                 }
                 else
                 {
                     $($input[1]).val(s.slice);
                     $div0.onchange((s.slice));
                     update();
                 }
            }

            var fetchfun =takeVal($($input[1]),function(v) {
                             if (onchange) 
                                onchange(v); 

                             setAMarker(sliceToAngle(v));
                             $div0.update() 

                             });
            var setfun = setVal($($input[1]))

            var $getclick = $("<a style='margin-left:10px;' class='KViewPort_tool'><i class='fa fa-circle'> get</i></a>").
            click(fetchfun).appendTo($div0).hide();
            var $setclick = $("<a style='margin-left:10px;' class='KViewPort_tool'><i class='fa fa-circle'> set </i></a>").
            click(setVal($($input[1]))).appendTo($div0).hide();

            var $angle = $("<span style='color:lightgray;margin-left:10px;'>NaN°</span>").appendTo($div0);

            $div0.trigger_get_click = fetchfun;
            $div0.trigger_set_click = setfun;

            var $done = $("<a class='KViewPort_tool ironsight_done' style='margin-left:10px;' ><i class='fa fa-check'> done </i></a>").
            click(function(e) {
                e.preventDefault();
                e.stopPropagation();
                var n = $div0.nextAll(".inputrow").first()
                n.trigger("click");
            }).appendTo($div0);



            $($input[1]).on('change', $div0.onchange );

            return $div0;
        }

        $("<div class='roiTool_panel_caption'>Ear canal overlap</div>").appendTo(panel.$container);


       var $ear_L = input_field("from left",function(v) {
                        left_ear = parseFloat(v);
                        setSVGtext("textupperEar",  "-90° = slice "+ left_ear.toFixed(0));

                        },"leftear")
       var $ear_R = input_field("from right",function(v) {

                        right_ear = parseFloat(v);
                        setSVGtext("textlowerEar",  "90° = slice "+ right_ear.toFixed(0));

                },"rightear")

        $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);

       $("<div><span> Left electrode </span></div>").appendTo(panel.$container);
       var $elec_La = input_field("from left",undefined,"eal")
       var $elec_Lp = input_field("from right",undefined,"epl")


        $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);
       $("<div><span> Right electrode </span></div>").appendTo(panel.$container);
       var $elec_Ra = input_field("from right",undefined,"ear")
       var $elec_Rp = input_field("from left",undefined,"epr")

       $elec_La.addClass("ironSight_ea")
       $elec_Ra.addClass("ironSight_ea")
       $elec_Lp.addClass("ironSight_ep")
       $elec_Rp.addClass("ironSight_ep")

       $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);
       var $helper = $("<div><span> helptext</span></div>").appendTo(panel.$container);
       $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);


	   var $tools = $("<div class='modernbuttongroup'></div>").appendTo(panel.$container);
	   var $save = $("<div class='modernbutton small green'><i class='fa fa-save'></i>Save</div>").appendTo($tools).click( function() {
            ironSight.save();
	        } );
	   var $reset = $("<div class='modernbutton small green'><i class='fa fa-close'></i>Reset</div>").appendTo($tools).click( function() {
        ironSight.input.ear_L.setVal();
        ironSight.input.ear_R.setVal();
        ironSight.input.elec_La.setVal();
        ironSight.input.elec_Ra.setVal();
        ironSight.input.elec_Lp.setVal();
        ironSight.input.elec_Rp.setVal();
	        } );






       $ear_L.trigger("click");

       this.input = { 
       elec_La: $elec_La,
       elec_Ra: $elec_Ra,
       elec_Lp: $elec_Lp,
       elec_Rp: $elec_Rp,
       ear_R:$ear_R,
       ear_L:$ear_L

       }

        
    }


}







var createGif = {
    cnt: 0,
    mode: "",
    startRecord: function()
    {
        if (createGif.$viewportContainer == undefined)
            createGif.$viewportContainer = KViewer.$viewportContainer;

        if (createGif.animate) 
            createGif.animate.cnt = undefined;



        if (createGif.recording)
        {
            console.warn("gif recorder stopped");
            createGif.mode = "";
            return;
        }
        var delay = parseInt(createGif.panel.$delay[1].value);
        var maxframe = parseInt(createGif.panel.$max[1].value);

        if (KViewer.hasControlsOn())
            KViewer.toggleElementsForScreenShot();

        createGif.panel.$container.find(".roiTool_panel_flex").addClass("inactive");
        createGif.$start.addClass('KViewPort_tool_enabled');
        createGif.$start.find("i").removeClass("fa-circle").addClass("fa-stop");
        createGif.$start.find("span").text(" Stop ");
        createGif.cnt = 0;
        createGif.mode = "recording";
        var gif = new GIF({
            workers: 5,
            quality: 3
        });
        var addframe = function()
        {


            html2canvas(createGif.$viewportContainer).then(function(canvas)
            {
                gif.addFrame(canvas, {
                    delay: delay
                });
                createGif.cnt++;
                createGif.$progress.text(" " + createGif.cnt);
                if (createGif.mode != "recording" || createGif.cnt > maxframe)
                {
                    createGif.$start.find("i").removeClass("fa-stop").addClass("fa-spinner fa-spin");
                    createGif.$start.find("span").text(" rendering ");
                    if (!KViewer.hasControlsOn())
                        KViewer.toggleElementsForScreenShot();
                    gif.on('finished', function(blob) {
                        saveScreenShot(blob, {}, '.gif', true);
                        createGif.mode = "";
                        createGif.$start.find("i").removeClass("fa-spinner fa-spin").addClass("fa-circle");
                        createGif.$start.find("span").text(" Record ");
                        createGif.panel.$container.find(".roiTool_panel_flex").removeClass("inactive");
                        createGif.$start.removeClass('KViewPort_tool_enabled');
                        createGif.$progress.text("");
                       

                    });

                    gif.render();

                }
                else
                {
                    if (createGif.animate)
                        createGif.animate();
                    setTimeout(addframe, 0);
                }

            });
        }
        addframe();
    },


    createPanel: function()
    {

        var panel = KPanel($(document.body), "GIFrecorder", "GIFrecorder");
        createGif.panel = panel;

        var $fileRow = $("<div class='roiTool_panel_flex_persistent'></div>").appendTo(panel.$container);
        var $start = $("<a class='KViewPort_tool'><i class='fa fa-circle'></i><span> Record </span></a>").appendTooltip("startstoprecord").click(
        function() {
            if (createGif.mode == "")
                createGif.startRecord();
            else if (createGif.mode == 'recording')
                createGif.mode = "rendering";
        });
        createGif.$start = $start;

        $fileRow.append($start).append($("<i class='flexspacer'></i>"));
        createGif.$progress = $(" <span>  </span>").appendTo($fileRow);

        $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);

        var $delayRow = $("<div class='roiTool_panel_flex'></div>").appendTo(panel.$container);
        panel.$delay = $(" <span> delay:  </span><input type = 'number' min='0' max='100' value='20'/> ").appendTo($delayRow);
        var $maxFrames = $("<div class='roiTool_panel_flex'></div>").appendTo(panel.$container);
        panel.$max = $(" <span> max #:  </span><input type = 'number' min='0' max='100' value='360'/> ").appendTo($maxFrames);

    }


}
/*
createGif.animate = function()
{
   var mv = KViewer.viewports[0].getCurrentViewer();

if (0)
{
   if (createGif.animate.cnt == undefined) // transversal
     createGif.animate.cnt = 85;
   mv.setSlicePos(2,createGif.animate.cnt++);

   if (createGif.animate.cnt == undefined) // coronal
     createGif.animate.cnt = 130;
   mv.setSlicePos(1,createGif.animate.cnt++);
}
   if (createGif.animate.cnt == undefined) // saggital
     createGif.animate.cnt = 125;
   mv.setSlicePos(0,createGif.animate.cnt++);



}

*/

function executeUnpackWorker(abuf, progress, onready)
{

    var scriptname = 'KunpackWorker.js' + '?' +  static_info.softwareversion;;
    if (typeof url_pref != "undefined")
       scriptname = url_pref + scriptname;

    var worker = new Worker(scriptname);


    worker.postMessage = worker.webkitPostMessage || worker.postMessage;

    worker.addEventListener('message', function(e) {
        e = e.data;
        if (e.msg == 'done')
        {
            if (progress != undefined)
                progress();
            logProcess("unzip done");
            onready(e);
        }
        else if (e.msg == 'error')
        {
            if (progress != undefined)
            {
                progress("unzip error:" + e.error.message);
                logProcess("unzip error:" + e.error.message);
                setTimeout(progress,2000);
            }
            else
            {
                console.error("unzip error:" + e.error.message)
                logProcess("unzip error:" + e.error.message);
                progress();
            }
            onready(e);
        }
        else
            if (progress != undefined)
            {
                progress(e.msg);
                logProcess(e.msg);
            }
    }, false);

    logProcess("unzip started");
    worker.postMessage(abuf.buffer, [abuf.buffer]);
    // Send data to our worker.

}




function autoExpandOneColumn(selector, columnid,minwidth)
{
    var $table = $(selector);
    var cols = $table.find("thead tr:first").children(':visible');

    var twid = 0;
    for (var k = 0; k < cols.length; k++)
    {
        var col = cols[k];
        twid += $(col).width()+1;
    }
    var targetwid = $table.parent().width()

    var diff = targetwid - twid;
    var c = $(cols[columnid]);
    var newwid = c.width() + diff - 11
    if (minwidth != undefined)
    {
        if (newwid < minwidth)
            newwid = minwidth;
    }
    if (1) // diff > 0)
    {
        c.attr('data-lastwidth', c.attr('data-lastwidth') || c.width());
        c.width(newwid);
    }
    else
    {
        if (newwid > c.attr('data-lastwidth'))
            c.width(newwid);
        else
        {
            c.width(c.attr('data-lastwidth'));
            c.removeAttr('data-lastwidth');
        }
    }
}





function showProgressFrameAboveDiv($div)
{
    var cumulativeOffset = function(element) {
        var top = 0
          , left = 0;
        do {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent;
        } while (element);

        return {
            top: top,
            left: left
        };
    }
    ;

    var pos = cumulativeOffset($div[0]);
    $('#KProgressFrame').remove();
    $progressframe = $("<div id='KProgressFrame'>" +
    " <div><i class='fa-5x fa fa-spinner fa-spin'></i></div>  </div>");
    $progressframe.css('left', pos.left)
    $progressframe.css('top', pos.top)
    $progressframe.css('height', $div.height());
    $progressframe.css('width', $div.width())
    var $close = $("<div> <i class='fa-close fa fa-3x'> </i> </div>");
    $progressframe.append($close)
    $progressframe.appendTo($(document.body));
    $close.click(function() { 
        ptablexhr.abort(); 
        hideProgressFrame();
    })

}

function hideProgressFrame()
{

    $('#KProgressFrame').remove();
}




function JSONparse_lazy(str)
{
    var tmp;
    try
    {
        tmp = JSON.parse(str);
        return tmp;
    }
    catch (e)
    {
        try
        {
            eval('tmp = ' + str);
            return tmp;
        }
        catch (e)
        {
            console.log('error during parsing json')
            console.error(e);
            return;
        }
    }
}


/** computes a lazy histogram 
 * @param {number} min lower bound of histogram
 * @param {number} max higher bound of histogram
 * @param {number} nbins number of bins
 * @param {array} the data to be binned
 * @param {number} length of data array
 * @param {number} number of samples
 */
function comphisto(min, max, nbins, data, n, numsamples,nonormalization)
{
    var EPSILON = 0.01;

    var cnt = 0;
    var histogram = {
        min: min,
        max: max
    };

    if (numsamples > n)
        numsamples = n;

    histogram.accus = new Array();

    for (var i = 0; i < nbins; i++)
        histogram.accus.push(0);
    var step = Math.floor(n / numsamples)
    for (var i = 0; i < n; i += step )
    {
        var val = math.floor(nbins * (data[i] - min) / (max - min));
        if (!isNaN(val) & val >= 0 & val < nbins & data[i] != 0)
        {
            histogram.accus[val]++;
            cnt++;
        }
    }
    if (nonormalization)
    {

    }
    else
        for (var i = 0; i < nbins; i++)
        {
            histogram.accus[i] = 100 * histogram.accus[i] / (cnt + EPSILON);
        }

    var maxfreq = 0;
    for (var k = 0; k < histogram.accus.length;k++)
    {
        if (histogram.accus[k] > maxfreq)
            maxfreq = histogram.accus[k];
    }
    histogram.accus.maxfreq = maxfreq;


    return histogram;
}


function getMinMax(data, n, numsamples)
{
    var max = data[0] + Number.EPSILON;
    var min = data[0];
    var isMask = true;
    for (var i = 0; i < n; i += Math.round(n / numsamples) * 2 + 1)
    {
        if (!isNaN(data[i]) & (isFinite(data[i])))
        {
            if (data[i] > max | isNaN(max))
                max = data[i];
            if (data[i] < min | isNaN(min))
                min = data[i];
        }
        ;
        if (data[i] != 0 & data[i] != 1)
            isMask = false;
        // treat isMask as special case later
    }


    return {
        max: max,
        min: min,
        isMask: isMask
    }
}




function KSetContentEditable($element, callback,defaultname,ondblclick,bluronenter)
{
    if (ondblclick)
        $element.on("dblclick",function(ev)
        {
            ev.preventDefault();
            ev.stopPropagation();
            $element.attr('contenteditable', 'true')    
            $element.focus();
        });
    else    
        $element.attr('contenteditable', 'true')
    $element.on('blur', function(ev) {
        callback($element,ev);
        var tmp = document.createElement("input");
         document.body.appendChild(tmp);
         tmp.focus();
         document.body.removeChild(tmp);
         if (ondblclick)
            $element.attr('contenteditable', 'false')
    })
    .on('keydown', function(ev) 
        {
            if (ev.keyCode == 13) { return false;            } 
    })
    .on('keyup', function(ev) 
    {
        if((ev.keyCode == 13) && bluronenter)
        {
            $(this).trigger('blur'); 
            return false;
        }
	    if($element.html().replace(/\s*[<br\s*/>]/g, '') == "")
            $element.html(defaultname);
        callback($element,ev);
    });


}

/** Format a number into string. Number of digits is adapted to number range
 * @param {number} x - the number
 * @function */
function niceFormatNumber(x)
{
    var absx = math.abs(x)
    if (absx > 100)
        return x.toFixed(0);
    else if (absx > 1)
        return x.toFixed(1);
    else
    {
        var ndig = 2 + Math.round(-Math.log(absx) / Math.log(10));
        if (!(ndig >= 0 && ndig < 20))
            return x;
        else
            return x.toFixed(2 + Math.round(-Math.log(absx) / Math.log(10)));
    }

}


/** Format a numeric filesize nicely
 * @param {number} sz - the number
 * @function */
function toFileSize(sz)
{
    if (sz == undefined)
        return "NA";
    if (sz > 1024 * 1024 * 1024)
        return (sz / 1024 / 1024 / 1024).toFixed(1) + "G";
    else if (sz > 1024 * 1024)
        return (sz / 1024 / 1024).toFixed(1) + "M";
    else if (sz > 1024)
        return (sz / 1024).toFixed(1) + "K";
    else
        return sz + "B";
}





/** The progress spinner
 * @param {div} $spinner - the div where the spinner lives
 * @function */
function theSpinner($spinner)
{
    var $abort = $("<div class='KSpinner_abortloading'> <i class='fa fa-close'> </i> </div>");
    $spinner.append($abort);
    var abortfun = undefined;


    var progressfun = function(perc, aborter)
    {
        if (aborter)
        {
            abortfun = aborter
            $abort.show();
        }
        else
        {
            abortfun = undefined;
            $abort.hide();
        }


        if (perc == undefined)
        {
            $spinner.css("display", "none");
            abortfun = undefined;
            return;
        }

        var txt;
        if ($.isNumeric(perc))
            txt = "<div class='spinnerbar'> <div class='innerbar' style='width:" + math.round(perc * 100) + "%'> </div> </div> ";
        else
            txt = perc;
        if ($("#KLoadingFrame").css("display") != "block")
        {
            if (perc == undefined)
            {
                that.$spinner.css("display", "none");
                return;
            }
            $spinner.css("display", "inline-block");
            $spinner.css("top", "60%");
            $spinner.css("left", "50%");
            $spinner.children()[1].innerHTML = txt;
        }
        else
        {
            //$("#KLoadingFrameText").text( txt );  	
            $("#KLoadingFrameTypeString").text("Loading Image Resources")
            $("#KLoadingFrameText")[0].innerHTML = txt;
        }

    }


    $abort.click(function()
    {
        if (abortfun != undefined)
        {
            var theaborter = abortfun;
            progressfun("aborting");
            setTimeout(function() {
                theaborter();
                progressfun();
            }, 0);
        }

    });

    return progressfun;

}

function dataURItoBlob(dataURI) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = atob(dataURI.split(',')[1]);

    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

    // write the bytes of the string to an ArrayBuffer
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    var blob = new Blob([ab],{
        type: mimeString
    });
    return blob;

    // Old code
    // var bb = new BlobBuilder();
    // bb.append(ab);
    // return bb.getBlob(mimeString);
}



/** print nice matrix representations for console log */
function print_matrix(m)
{
    m = m._data || m;
    if (Array.isArray(m))
    {
        if (!Array.isArray(m[0]))
            m = [m];
    }
    else
    {
        m = [[m]];
    }

    var s = "\n";

    var rows = m.length;
    var cols = m[0].length;
    for (var k = 0; k < rows; k++)
    {
        for (var r = 0; r < cols; r++)
        {
            var x = ("             " + Math.round(m[k][r] * 100) / 100);
            x = x.substr(x.length - 10);
            s += (" " + x);
        }
        //if( k < rows-1)
        s += "\n";
    }
    return s;
}


function randperm(maxValue) {
    // first generate number sequence
    var permArray = new Array(maxValue);
    for (var i = 0; i < maxValue; i++) {
        permArray[i] = i;
    }
    // draw out of the number sequence
    for (var i = (maxValue - 1); i >= 0; --i) {
        var randPos = Math.floor(i * Math.random());
        var tmpStore = permArray[i];
        permArray[i] = permArray[randPos];
        permArray[randPos] = tmpStore;
    }
    return permArray;
}

/** uploads a freshly created binary which has not yet been assigned to a subject
 * @param {object} fobj - the fileObject
 * @param {object} finfo - addtional fileinfo used for upload
 * @param {callback} progress - called during upload
 * @param {callback} callback - called after upload
 */
function uploadUnregisteredBinary(fobj, finfo, progress, callback,zipped)
{
    uploadBinary(fobj, finfo,
    function(id, response)
    {
        var newid = response.fileID;
        var roi = KViewer.dataManager.getFile(id);
        if (roi != undefined)
        {
            roi.modified = false;
            if (newid != id)
            {
                roi.fileID = newid;
                roi.fileinfo = $.extend(roi.fileinfo, finfo);
                KViewer.dataManager.setFile(newid, roi);
                KViewer.dataManager.delFile(id);
                callback(newid, id);

                patientTableMirror.mirrorState();
                KViewer.cacheManager.update();
            }
            alertify.success('successfully saved ' + roi.filename);
        }
        else
            alertify.success('successfully saved ' + fobj.filename);

    }, progress, zipped, "usenativePID");
}


function attachMouseSlider($target, callbacks, options)
{
    // a generalized handler for mouse down and move, calculating the relative dx and dy
    /*
        callbacks:
            mousedown(ev)
            mousemove(ev, dx, dy)
            mouseup(ev)
            mousedownvar: remember vars when sliding starts and pass to mousemove

            options:
                showMinMaxRange:  whow the max range
    */
    
    // this will be overwritten when mousedown returns a relative start value
    var showMinMaxRange = false;

    var $slider;
    var baseheight = 40;
    var basemargin = 10;
    
    // this defines the reference range
    var refrange = 200;

    var speed = 1;
    var allowSpeedChange = false;

    $target.mousedown( mousedown )
    function mousedown(ev)
    {
        ev.stopPropagation();
        ev.preventDefault();
        
        var starDiffX = -ev.clientX; 
        var starDiffY = -ev.clientY;

        var lastX = starDiffX;
        var lastY = starDiffY;

        if(callbacks.mousedown)
            var mousedownvar =  callbacks.mousedown(ev);
        else
            var mousedownvar = undefined;

        
        if(1) // always who the slider bar
        {
           var $indicator = $("<div class='KMouseSliderIndicator'></div>");
           
           var $upper = $("<div class='KMouseSliderIndicator_bg' style='bottom:0px'></div>").appendTo($indicator);
           var $lower = $("<div class='KMouseSliderIndicator_bg' style='top:0px'></div>").appendTo($indicator);

           var $plus   = $("<i style='top:2px;' class='fa fa-plus'>").appendTo($upper);
           var $minus = $("<i style='bottom:2px;' class='fa fa-minus'>").appendTo($lower);

           //var $center = $("<div class='KMouseSliderIndicator_center'></div>").appendTo($indicator);
           var $ball = $("<div class='KMouseSliderIndicator_ball'></div>").appendTo($indicator);
           var $currentVal = $("<div class='KMouseSliderIndicator_currentval'></div>").appendTo( $ball );

           var pp = getPixelPosition($target);
           var center = [ pp[0] + pp[2]/2, pp[1] + pp[3]/2 ];

           setPixelPosition($indicator, [center[0] + 2 , center[1] - 2, 8, 8]);
           

           var ww = getPixelPosition($(document.body));
           if(ww[2] - center[0] > 50)
               $currentVal.css('left', '150%'); 
            else
               $currentVal.css('right','150%'); 

            // initialise
            if( mousedownvar != undefined && mousedownvar.startval !=undefined )
                $currentVal.text( mousedownvar.startval.toFixed(0) )

            // right click: slide faster
            
            setReferenceRange( ev.button + 1);

            if(options && options.hideCurrentval)
                $currentVal.hide();
                
            $indicator.appendTo( $(document.body ) );
        }

        function setReferenceRange(speed_new)
        {
            speed = speed_new;
            baseheight = 40 / speed + 10;
            refrange   = 200 / speed
            if( mousedownvar.startval_percent != undefined )
            {
                $upper.height( refrange * (1-mousedownvar.startval_percent)    + 10); 
                $lower.height( refrange * (mousedownvar.startval_percent)+ 10);
                showMinMaxRange = true;
            }
            else
            {
               $upper.height(baseheight);
               $lower.height(baseheight);
            }
        }


        $(document.body).mousemove(function(ev)
        {
            var dx = starDiffX + ev.clientX;
            var dy = starDiffY + ev.clientY;
            
            var wasinrange = true;
            
            //  allow to change speed
            if(allowSpeedChange)// math.abs(dy) < 10)
            {
                var scale = 20;
                var step = 15;
                // allow step wise
                var temp = 1 /math.exp( math.round(dx/step)*step/scale );

                if(temp > .1 & temp < 10)
                    setReferenceRange( temp );
                    
            }

            if(callbacks.mousemove)
            {
                // give also increment to last move motion
                var lastdx = speed*(lastX + ev.clientX); lastX = -ev.clientX;
                var lastdy = speed*(lastY + ev.clientY); lastY = -ev.clientY;

                var ret = callbacks.mousemove(ev, dx/refrange, dy/refrange, mousedownvar, lastdx, lastdy);
                if(ret != undefined && ret.wasinrange !== undefined && ret.value !=undefined )
                {
                    wasinrange = ret.wasinrange;
                    if(wasinrange)
                        $currentVal.text( ret.value.toFixed(0) )
                }

            }
            
            if(wasinrange)
            {
                if(!showMinMaxRange)
                {
                    if(dy*dy > baseheight*baseheight - basemargin*basemargin)
                    {
                        if(dy < baseheight -basemargin )
                        {
                            $upper.height(-dy + basemargin);
                        }
                        else if(dy > baseheight -basemargin)
                        {
                            $lower.height(+dy +basemargin)
                        }
                    }
                }
                $ball.css('top', dy + 'px');
            }
        });

        $(document.body).on('mouseup mouseleave', function(ev)
        {
            $indicator.remove();
            $currentVal.remove();
            $(document.body).off('mousemove mouseup mouseleave');
            if (callbacks.mouseup)
                callbacks.mouseup(ev);
            return false
        });


    }
    return $target
}


// slider for quick adjustment of input fields (similar to the arrows but faster)
function KMouseSlider($targetinput, options_in)
{

    $targetinput.css('position', 'relative'); 
    
    var options = 
    {
        incrementPerPixel: 1,
        logScaling:0,
        min:0,
        max:Infinity,
        direction: 'ud',
        updateonmove:1,
        updateonrelease: 0,
        hideCurrentval:1,
        callback: undefined
    }
    $.extend(true, options, options_in)

    var $slider = $("<div class='KMouseSliderBtn'><i class='fa fa-unsorted'></i></div>");
    
    attachMouseSlider($slider, {
        mousedown: function(ev, dx, dy, mousedownvar)
        {
            //if(options.updateonstart) not implemented, since it would only make sense to pass a special function...
            return {startval: parseFloat($targetinput.val()) }
        },
        mousemove: function(ev, dx, dy, mousedownvar)
        {
           var newval = (mousedownvar.startval + options.incrementPerPixel * -dy *200);
           if(options.logScaling > 0 && newval < 1 &&  newval > -1) // allow float values between 0 and 1
                newval = math.round(newval*options.logScaling)/options.logScaling;
           else
                newval = math.round(newval)
                
           wasinrange = false;
           if(newval >= options.min && newval <= options.max)
           {
                $targetinput.val( newval  );
                if(options.updateonmove)
                    $targetinput.trigger("change");
                wasinrange = true;
           }
           return {wasinrange:wasinrange, value: newval }
        },
        mouseup: function()
        {
            if(options.updateonrelease)
                $targetinput.trigger("change");
        }
    }
    ,
    {
        hideCurrentval:options.hideCurrentval
    }
    )


    $slider.insertAfter($targetinput);

    return $slider;
    
}


function movableWindowMousedownFn(ev, $container, callbackAfterMove, ignoreClass)
{
    if (!$container.hasClass("movableWindows"))
        $container.addClass("movableWindows");

    if ($(ev.originalEvent.target).hasClass(ignoreClass))
        return false;

    var starDiffX = -ev.clientX + $container.offset().left;
    var starDiffY = -ev.clientY + $container.offset().top
    $(document.body).mousemove(function(ev)
    {
        var dx = starDiffX + ev.clientX;
        var dy = starDiffY + ev.clientY;
        if(dy < 32) // min top distance
            dy = 32; 
        $container.offset({
            top: dy,
            left: dx
        });

    });
    $(document.body).on('mouseup mouseleave', function(ev)
    {
        //$(this).off('mousemove'); // "this" is the body ...? so why?
        $(document.body).off('mousemove mouseup mouseleave');
        // must remove the mouseup handler again!!
        if (callbackAfterMove != undefined)
            callbackAfterMove();
        return false

    });

    bringToFront($container);
}

function maximizerButton($menu, $target)
{
   var $max = $("<li  style='float:right'><a> <i class='fa fa-window-restore' ></i></a></li>").appendTooltip("maximize")
   .on("click", function(ev) 
   {
       if($max.oldsize == undefined)
       {
           $max.maxstate = true;
           $max.oldsize = getPixelPosition($target);
           maximizeWindow($target);
       }
       else
       {
           setPixelPosition($target, $max.oldsize, 1);
           delete $max.oldsize;
       }
   });
   $max.appendTo($menu);
}

function maximizeWindow($target, animate)
{
   if(animate== undefined)
        animate = 1;
        
   var topmargin = 38;
   var w = $body.width();
   var h = $body.height();
   setPixelPosition($target, [ 0, topmargin, w-2, h-topmargin-5 ], animate);
}


function resizeSplitter($attachTo, $resizeTarget)
{
    if($resizeTarget==undefined)
        $resizeTarget = $attachTo;
    var $leftresizer = $("<div class='resizer_vertical'><div><div></div></div></div>").appendTo($attachTo).mousedown(resizeSplitterInternal);
	function resizeSplitterInternal(ev)
	{
		ev.preventDefault();
    	var x = ev.clientX;

    	var $target  = $resizeTarget;
		var w = $target.width();
        var h = $target.height();
	    $body.on("mouseup mouseleave",   mymouseup);
  		$body.on("mousemove", moveUnlagger(mymousemove)) ;
		function mymousemove(ev)
		{
			   var nx =  ev.clientX;
			   var neww = w-(x - nx)
			   if (neww > 100)
			   	$target.width(w- (x - nx));
		}

		function mymouseup(ev)
		{
			$body.off("mousemove mouseup mouseleave");
			ev.preventDefault();
		}
	}
	return $leftresizer;
}





// helpers, similar to matlab conventions
function getPixelPosition($target)
{
    var offs = $target.offset();
    var sizes = [ offs.left, offs.top,$target.width(), $target.height(),];
    return sizes;

}

function setPixelPosition($target, sizes, animate)
{
    if(animate)
        $target.animate({'left': sizes[0], 'top': sizes[1], width: sizes[2], height:  sizes[3] } , 180 );
    else
        $target.css({'left': sizes[0], 'top': sizes[1], width: sizes[2], height:  sizes[3] } );
}

function isMouseEventOverDiv(e, $div)
{
    var pp = getPixelPosition( $div);
    return ( e.clientX > pp[0] && e.clientX < pp[0]+pp[2] && e.client> pp[1] && e.client < pp[1]+pp[3]   )
}


// pops a div out from a certain point or element
function popShow($div, $popoutTo)
{
    var targetpos = getPixelPosition($popoutTo);
    $div.attr('savedposition', getPixelPosition($div).join(','));
    setPixelPosition($div, targetpos, 1);
    $div.fadeOut(250);
}

// hides a div by moving it into a certain element or point
function popHide($div, $popoutFrom)
{
    var frompos = getPixelPosition($popoutFrom);
    var targetpos = $div.attr('savedposition');
    if(targetpos!=undefined)
        targetpos = targetpos.split(',')
    else    
        targetpos =  getPixelPosition($div);// [ 400, 400, 400, 400];
    
    bringToFront($div);
    $div.fadeIn(250);
    setPixelPosition($div, frompos, 0);
    setPixelPosition($div, targetpos, 1);
}


// brings a container to front and reorders the group
function bringToFront($div, theclass)
{
    if (theclass == undefined)
        theclass = "movableWindows";

    var elems = $("." + theclass);

    var zinds = [];
    var index_highest = parseInt(elems.eq(0).css("z-index"), 10);
    
    elems.each(function() 
    {
        zinds.push([$(this), parseInt($(this).css("z-index"), 10)]);;
    });

    zinds.sort(function(a, b) {
        return a[1] - b[1];});
        
    var off =0;
    var basez = 10;
    for(var k=0;k<zinds.length; k++)
    {
        if( zinds[k][0].is($div) )
        {
            var ind = zinds.length;
            off = 1;
        }
        else
        {
            var ind = k -off;
        }
        zinds[k][0].css('z-index',  (basez + ind).toString());
    }
    

}




function getHighestZIndexOfSameClass(theclass)
{
    if (theclass != undefined)
        var elems = $("." + theclass);
    else
        var elems = $("div");

    var $div
    var indlist = [];
    var index_highest = parseInt(elems.eq(0).css("z-index"), 10);
    elems.each(function() 
    {
        var index_current = parseInt($(this).css("z-index"), 10);
        indlist.push(index_current);
        if (index_current > index_highest && index_current < 100000) // only go up to 1000 or so, loading frame will have max
        {
            index_highest = index_current;
            $div = $(this);
        }
    });
    

    return {
        div: $div,
        index: index_highest
    };

}



function squeeze(arr)
{
    var tmp = [];
    for (var k = 0 ; k < arr.length;k++)
        if (arr[k] != undefined)
            tmp.push(arr[k]);
    arr.splice(0,arr.length);
    for (var k = 0; k < tmp.length;k++)
        arr.push(tmp[k]);
    return arr;
}


if (typeof jQuery != "undefined")
{
    // used to make a input/text editable on sinle click
    // the callback is given with "keyup", optionally, a final callback can be passed
    function makeEditableOnDoubleClick($elem, callback)
    {
        $elem.on('blur', function(ev)
        {
            this.contentEditable = false;
            $(this).removeAttr("contentEditable")
            var val = $(this).text().trim().replace("\n", "");
            $(this).text(val);
            if (val == "")
            {
                $(this).text("enter_text");
                $(this).trigger("keyup");
                $(this).trigger("dblclick");
            }
            if(callback)
                callback();
        })
        .on("dblclick", function(e) {
            this.contentEditable = true;
            // must click again, otherwise might be deselected (if some click mechanism involved)
            //$(this).trigger("click"); 
            $(this).focus().select();
            document.execCommand('selectAll', false, null );
            e.preventDefault();
            e.stopPropagation();
            return false;
            ;
        })
        .on('keydown', function(e){
            if(e.keyCode == 13)
            {
                $(this).trigger("blur");
                return false;
            }
        }
        )

    }

}




/** converts utf-16 encoded ArrayBuffer to String 
 * @function */
function ab2str(buf) {
    var chars = new Uint16Array(buf);
    var s = "";
    var l = chars.length;
    for (var i = 0; i < l; i++)
    {
        if (chars[i] == 0)
            break;
        s += String.fromCharCode(chars[i]);
    }
    return s;
    //return String.fromCharCode.apply(null, new Uint16Array(buf));
}



/** converts utf8 encoded ArrayBuffer to String 
 * @function */
function utf8ab2str(array) {
    var out, i, len, c;
    var char2, char3;

    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
        c = array[i++];
        switch (c >> 4)
        {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            // 0xxxxxxx
            out += String.fromCharCode(c);
            break;
        case 12:
        case 13:
            // 110x xxxx   10xx xxxx
            char2 = array[i++];
            out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
            break;
        case 14:
            // 1110 xxxx  10xx xxxx  10xx xxxx
            char2 = array[i++];
            char3 = array[i++];
            out += String.fromCharCode(((c & 0x0F) << 12) |
            ((char2 & 0x3F) << 6) |
            ((char3 & 0x3F) << 0));
            break;
        }
    }
    return out;
}






/** create a  nifti object and adds it the worspace
 * @param {object} nii - a Object containng edges,voxSize,sizes
 * @param {string} name - the new name
 * @param {string} type - either uint8,float,uint16
 * @param {integer} tdim - size of the fourth dimension
 */
function createNifti(nii,name,type,tdim)
{
     nii.pixdim = [1,nii.voxSize[0],nii.voxSize[1],nii.voxSize[2]];
     var fobj = cloneNifti({content:nii}, name + ".nii", type, tdim);
     fobj.fileID = name; 
     KViewer.dataManager.setFile(fobj.fileID,fobj);
     KViewer.cacheManager.update();     
     return fobj.content;
 
}


/** clones a nifti object
 * @param {object} fobj - a fileObject 
 * @param {string} name - the new name
 * @param {string} type - either uint8,float,uint16
 * @param {integer} tdim - size of the fourth dimension
 * @param {float} fac - undersampling factor
 */
function cloneNifti(fobj, name, type, tdim,fac)
{
    var fileObject = {};

    var nii = fobj.content;
    var littleEndian = nii.endian == 'little' || true;

    if (tdim == undefined)
        tdim = 1;
    else if (tdim == "sametdim")
        tdim = nii.sizes[3];

    if (fac == undefined)
        fac = 1;



    // set the bruker header to nifti header
    var niihdr = [92, 1, 0, 0, 117, 105, 110, 116, 49, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 0, 1, 0, 16, 0, 16, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 16, 0, 0, 0, 0, 0, 128, 191, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 111, 110, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 191, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 191, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 105, 49, 0, 0, 0, 0, 0];
    var hdrbuffer = (new Uint8Array(niihdr)).buffer;

    if (type == undefined)
        type = 'uint8';


    var types = {
        "uint8": {
            type: 2,
            bitpix: 8
        },
        "float": {
            type: 16,
            bitpix: 32
        },
        "int16": {
            type: 4,
            bitpix: 16
        },
        "uint16": {
            type: 512,
            bitpix: 16
        }
    }
    var t = types[type];

    var sizes = [math.floor(nii.sizes[0]/fac),math.floor(nii.sizes[1]/fac),math.floor(nii.sizes[2]/fac) ];


    var buffer = new Uint8Array(hdrbuffer.byteLength + t.bitpix / 8 * sizes[0] * sizes[1] * sizes[2] * tdim);
    buffer = buffer.buffer;

    var view = new DataView(buffer);

    // sizes
    view.setInt32(0, 348, littleEndian)
    if (tdim > 1)
        view.setInt16(40, 4, littleEndian)
    else
        view.setInt16(40, 3, littleEndian)
    view.setInt16(42, sizes[0], littleEndian)
    view.setInt16(44, sizes[1], littleEndian)
    view.setInt16(46, sizes[2], littleEndian)
    view.setInt16(48, tdim, littleEndian)

    // edges
    // spaceDirections are stored column wise (column index first)
    // multiplication in javascript is row-wise defined, therefore transpose at the end
    var edges;
    if (nii.spaceDirections == undefined)
        edges = nii.edges
    else
    {
        edges =  math.eye(4);
        edges._data[0][0] = nii.spaceDirections[0][0];
        edges._data[0][1] = nii.spaceDirections[0][1];
        edges._data[0][2] = nii.spaceDirections[0][2];
        edges._data[1][0] = nii.spaceDirections[1][0];
        edges._data[1][1] = nii.spaceDirections[1][1];
        edges._data[1][2] = nii.spaceDirections[1][2];
        edges._data[2][0] = nii.spaceDirections[2][0];
        edges._data[2][1] = nii.spaceDirections[2][1];
        edges._data[2][2] = nii.spaceDirections[2][2];
        edges._data[3][0] = nii.spaceOrigin[0];
        edges._data[3][1] = nii.spaceOrigin[1];
        edges._data[3][2] = nii.spaceOrigin[2];
        edges = math.transpose(edges);
    }

    view.setFloat32(280 + 0 * 4, edges._data[0][0]*fac, littleEndian);
    view.setFloat32(280 + 1 * 4, edges._data[0][1]*fac, littleEndian);
    view.setFloat32(280 + 2 * 4, edges._data[0][2]*fac, littleEndian);
    view.setFloat32(280 + 3 * 4, edges._data[0][3], littleEndian);

    view.setFloat32(280 + 4 * 4, edges._data[1][0]*fac, littleEndian);
    view.setFloat32(280 + 5 * 4, edges._data[1][1]*fac, littleEndian);
    view.setFloat32(280 + 6 * 4, edges._data[1][2]*fac, littleEndian);
    view.setFloat32(280 + 7 * 4, edges._data[1][3], littleEndian);

    view.setFloat32(280 + 8 * 4, edges._data[2][0]*fac, littleEndian);
    view.setFloat32(280 + 9 * 4, edges._data[2][1]*fac, littleEndian);
    view.setFloat32(280 + 10* 4, edges._data[2][2]*fac, littleEndian);
    view.setFloat32(280 + 11* 4, edges._data[2][3], littleEndian);

    if (nii.pixdim == undefined)
    {
        nii.pixdim = [nii.sizes.length];
        nii.pixdim = nii.pixdim.concat(nii.sizes);
    }


    for(var i=0; i<nii.pixdim.length; i++) {
       if (i > 0 &&  i <= 3)
        view.setFloat32(76+4*i, nii.pixdim[i]*fac, littleEndian)
    }


    view.setInt16(252, 0, littleEndian)
    //qform
    view.setInt16(254, 1, littleEndian)
    //sform


    // ====== apply some other important stuff
    // set the magic number to n+1
    view.setInt32(344, 1848324352, !littleEndian)
    // set vox offset to 352
    view.setFloat32(108, 352, littleEndian)


    view.setFloat32(112, 1, littleEndian)
    view.setFloat32(116, 0, littleEndian)


    view.setInt32(348, 0, littleEndian);



    view.setInt16(70, t.type, littleEndian);
    view.setInt16(72, t.bitpix, littleEndian);




    fileObject.buffer = buffer;

    // parse nifti
    fileObject.content = prepareMedicalImageData(parse(fileObject.buffer), fileObject);
    fileObject.contentType = "nii";

    var subfolder;    
    if (name && name.split("/").length > 1)
    {
        var split = name.split("/");
        name = split[split.length-1];
        if (split.length > 1)
        {
            split.pop();
            subfolder = split.join("/");
        }

    }


    fileObject.filename = name;
    fileObject.editable = true;
    fileObject.fileinfo = {};
    if (fobj.fileinfo)
    {
        fileObject.fileinfo.patients_id = fobj.fileinfo.patients_id;
        fileObject.fileinfo.studies_id = fobj.fileinfo.studies_id;
        fileObject.fileinfo.SubFolder = subfolder;
    }



    return fileObject;
}

/** resizes a Nifti object (space origin and sizes only. Object must have been already created and prepared)
 * @param {object} fobj - a fileObject 
 * @param {array} spaceorigin - the new corner of the edges
 * @param {array} sizes - the new size of the array
 * @param {bool}  keepconten - keep (copy) the old image, or create a  new empty array
 */
function resizeNifti(fobj, edges, sizes)
{
    var nii = fobj.content;
    var littleEndian = nii.endian == 'little' || true;
    var buffer = nii.buffer;
    var view = new DataView(buffer);

    // ----------------- space origin only
    /*
    if( spaceorigin != undefined)
    {
        nii.spaceOrigin = spaceorigin._data;
        nii.edges._data[0][3] = nii.spaceOrigin[0];
        nii.edges._data[1][3] = nii.spaceOrigin[1];
        nii.edges._data[2][3] = nii.spaceOrigin[2];
        // update header
        view.setFloat32(280 + 3 * 4, nii.edges._data[0][3], littleEndian);
        view.setFloat32(280 + 7 * 4, nii.edges._data[1][3], littleEndian);
        view.setFloat32(280 + 11 * 4, nii.edges._data[2][3], littleEndian);
    }
    */

    if(  edges != undefined)
    {
        nii.edges = edges;
        nii.spaceOrigin[0] = edges._data[0][3]; 
        nii.spaceOrigin[1] = edges._data[1][3];
        nii.spaceOrigin[2] = edges._data[2][3];
        
        nii.spaceDirections = math.transpose(nii.edges)._data;

        var permutationOrder = [findIndexOfGreatest(nii.spaceDirections[0]), findIndexOfGreatest(nii.spaceDirections[1]), findIndexOfGreatest(nii.spaceDirections[2])];
        nii.arrayReadDirection = [nii.spaceDirections[0][permutationOrder[0]] < 0 ? -1 : 1, nii.spaceDirections[1][permutationOrder[1]] < 0 ? -1 : 1, nii.spaceDirections[2][permutationOrder[2]] < 0 ? -1 : 1, ];
        nii.permutationOrder = permutationOrder;
        var Order = KMedViewer.getPermutationOrder();
        var perm = Order.perm;
        var flips = Order.flips;

        nii.permutationOrder = [perm[nii.permutationOrder[0]], perm[nii.permutationOrder[1]], perm[nii.permutationOrder[2]]];
        nii.arrayReadDirection = [flips[nii.permutationOrder[0]] * nii.arrayReadDirection[0], flips[nii.permutationOrder[1]] * nii.arrayReadDirection[1], flips[nii.permutationOrder[2]] * nii.arrayReadDirection[2]];

        nii.invPermOrder = [];
        nii.invPermOrder[nii.permutationOrder[0]] = 0;
        nii.invPermOrder[nii.permutationOrder[1]] = 1;
        nii.invPermOrder[nii.permutationOrder[2]] = 2;

        nii.voxSize[0] = math.sqrt(nii.spaceDirections[0][0] * nii.spaceDirections[0][0] + nii.spaceDirections[0][1] * nii.spaceDirections[0][1] + nii.spaceDirections[0][2] * nii.spaceDirections[0][2]);
        nii.voxSize[1] = math.sqrt(nii.spaceDirections[1][0] * nii.spaceDirections[1][0] + nii.spaceDirections[1][1] * nii.spaceDirections[1][1] + nii.spaceDirections[1][2] * nii.spaceDirections[1][2]);
        nii.voxSize[2] = math.sqrt(nii.spaceDirections[2][0] * nii.spaceDirections[2][0] + nii.spaceDirections[2][1] * nii.spaceDirections[2][1] + nii.spaceDirections[2][2] * nii.spaceDirections[2][2]);



        // update header
        view.setFloat32(280 + 0 * 4, nii.edges._data[0][0], littleEndian);
        view.setFloat32(280 + 1 * 4, nii.edges._data[0][1], littleEndian);
        view.setFloat32(280 + 2 * 4, nii.edges._data[0][2], littleEndian);
        view.setFloat32(280 + 3 * 4, nii.edges._data[0][3], littleEndian);

        view.setFloat32(280 + 4 * 4, nii.edges._data[1][0], littleEndian);
        view.setFloat32(280 + 5 * 4, nii.edges._data[1][1], littleEndian);
        view.setFloat32(280 + 6 * 4, nii.edges._data[1][2], littleEndian);
        view.setFloat32(280 + 7 * 4, nii.edges._data[1][3], littleEndian);

        view.setFloat32(280 + 8 * 4, nii.edges._data[2][0], littleEndian);
        view.setFloat32(280 + 9 * 4, nii.edges._data[2][1], littleEndian);
        view.setFloat32(280 + 10 * 4, nii.edges._data[2][2], littleEndian);
        view.setFloat32(280 + 11 * 4, nii.edges._data[2][3], littleEndian);
    }


    // ------------------ sizes
    if( sizes != undefined)
    {
        if(sizes[0] > nii.sizes[0] | sizes[1] > nii.sizes[1] | sizes[2] > nii.sizes[2])
        {
            nii.sizes = sizes;
            nii.widheidep = nii.sizes[0] * nii.sizes[1] * nii.sizes[2];
            nii.widhei = nii.sizes[0] * nii.sizes[1];
            nii.wid = nii.sizes[0];

             
            var tdim = sizes[3];
            var hdroffset = nii.hdroffset;

            var bitpix = view.getInt16(72, littleEndian)
            var tmp = new Uint8Array(hdroffset + bitpix / 8 * sizes[0] * sizes[1] * sizes[2] * tdim);

            // copy the header
            tmp.set(new Uint8Array(nii.buffer, 0, hdroffset) );
            
            nii.buffer = tmp.buffer;
            nii.data = new Uint8Array(nii.buffer, hdroffset);

            // update header
            if (tdim > 1)
                view.setInt16(40, 4, littleEndian)
            else
                view.setInt16(40, 3, littleEndian)

            view.setInt16(42, nii.sizes[0], littleEndian)
            view.setInt16(44, nii.sizes[1], littleEndian)
            view.setInt16(46, nii.sizes[2], littleEndian)
            view.setInt16(48, tdim, littleEndian)

        }

    }


}


/** used to unlag mouse move events in firefox 
 * @function */
function moveUnlagger(fun, cloneEvent)
{
    var lastMove = false;
    if (!(/Firefox/i.test(navigator.userAgent)))
        return fun;
    else
    {
        var movefun = function(ev, s)
        {
            if (!lastMove)
            {
                if (cloneEvent)
                {
                    var event = $.extend({}, ev);
                    setTimeout(function() {
                        fun(event, s)
                    }, 0);
                }
                else
                    setTimeout(function() {
                        fun(ev, s)
                    }, 0);
            }
            lastMove = true;
            setTimeout(function() {
                lastMove = false;
            }, 10);
            ev.preventDefault();
            // return false;

        }
        return movefun;
    }
}


function getloadParamsFromDrop(ev,intent, progress)
{



  var params_arr  = [];
  if(ev.dataTransfer != undefined && ev.dataTransfer.files.length > 0)
  {
	for (var l = 0;l <ev.dataTransfer.files.length;l++)
	   params_arr.push(createParamsLocalFile( ev.dataTransfer.files[l],intent, progress ) );
	return params_arr;
  }
  
  // dataTransfer might be reordered during drag ... not really good but must live with it
  if (ev.dataTransfer != undefined &&  (ev.dataTransfer.types[0] == 'form' | ev.dataTransfer.types[1] == 'form' ))
  {
      var params = {};
      params.URLType  = 'form';
      if (ev.dataTransfer.types[0] == 'form')
         params.fileID = ev.dataTransfer.types[1];
      else
         params.fileID = ev.dataTransfer.types[0];
      params_arr.push(params);
     return params_arr;
  }

  if (tempObjectInfo != undefined)
  {
	    function objinfo2loadParams(objinfo)
	    {
			  var params = {};
			  params.URLType  = 'serverfile';
			  params.fileID    = objinfo.fileID; 
			  params.close = objinfo.close;
			  var ev_intent = {};
			  if (objinfo.intent != undefined)
			  {
				if (typeof objinfo.intent == "string")
					eval('ev_intent={'+objinfo.intent +'};');
				else
				    ev_intent = objinfo.intent;
			  }
			  params.intent = $.extend(true,ev_intent,intent);
			  return params;    	
	    }

		for (var l=0;l <tempObjectInfo.length;l++)
		{
		  var params = {};
		  if (tempObjectInfo[l].type == 'file')
		  {
			  params_arr.push(objinfo2loadParams(tempObjectInfo[l]));
		  }
		  else if (tempObjectInfo[l].type == 'subfolder')
		  {
		  	var elem = $("tr[rowid_parent='" + tempObjectInfo[l].piz + riddelim + tempObjectInfo[l].sid + riddelim + tempObjectInfo[l].subfolder + "'][data-type='file']:first");		  	
		  	if (elem.length>0)
		  		 params_arr.push(objinfo2loadParams(packObjectInfo(elem[0])));
		  } 
		  else if (tempObjectInfo[l].type == 'study')
		  {
			return {patient_study_drop: tempObjectInfo[l].piz + riddelim + tempObjectInfo[l].sid };
		  }
		  else if (tempObjectInfo[l].type == 'patient')
		  {
		  	  return {patient_study_drop: tempObjectInfo[l].piz };
		  }
		  else if (tempObjectInfo[l].type == 'markertemplate')
		  {
		  	  return  tempObjectInfo[l] ;
		  }
		  else if (tempObjectInfo[l].type == 'tagpaneltag')
		  {
		  	  return  tempObjectInfo[l] ;
		  }

		}
        return params_arr;
  }
  
  return params_arr;
  
}

function cleanAllDropIndicators()
{
    $('.KView_viewportdropIndicator').fadeOut(220, function(){});
    $('.KView_autoloader_dropIndicator').fadeOut(220, function() { $(this).remove() } );
    $('.body_dropindicator').fadeOut(220, function() { $(this).remove() } );
    //tempObjectInfo = undefined;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// USER settings
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function UserSettingsDialog()
{
   
   var that = new dialog_generic();
   that.$frame.width("500px").height("800px");

	
   var form = 
   { 
	name 		: "usersettings",
	lastchange  : "",
	layout: 
	[
 	  {	type: 'title', val: userinfo.username}
	 ,{ type: 'separator', css: ["height","1px"] }
	 	,{name:"fullname"				, type: 'input',     defaultval:""  }
	 	,{name:"email"					, type: 'input',     defaultval:""  }
	 	,{name:"institution"				, type: 'input',     defaultval:""  }
	 	,{name:"street"				, type: 'input',     defaultval:""  }
	 	,{name:"city"				, type: 'input',     defaultval:""  }
	 	,{name:"forceanonymize"				, type: 'check',     defaultval:false  }
	 	 ,{type:"separator"}
	 	,{name:"passwd"				    , type: 'input', val:'3434',    defaultval:""  }
	 	 ,{type:"separator"}
		,{name:"styletheme"		        , type: 'option',  style:"",  title:" Styling theme",
  	    	choices: ["classic blue","greenish","redish"],
  	    	ids:     ["classic", "green", "red"] ,defaultval:'classic' }

	] }

	userinfo.id = userinfo.ID;
    var content= userinfo;

    KForm.getFormContent(form, content);




    var $div = $("<div class='usersettings'></div>").appendTo(that.$container);
    KForm.createForm(form, content, $div, onchange);


    var $style = $div.find("div[name='styletheme']").find("select");
    $style.on("change",function()
    {
        that.saveChanges();
        alertify.success("Reload/press F5 to let changes to become active");

    });

    var $pwd = $div.find("input[name='passwd']");
    $pwd.attr('placeholder','click to change').attr('readonly',true).on("click",changepwd);
	
	function changepwd()
	{
		$pwd.parent().nextAll().remove();
		var $div = $("<div><br></div>").insertAfter($pwd.parent())	
		var $errmsg = $("<div style='color:red; text-align:center'></div>").appendTo($div);
		var $pw0 = $("<label class='KFormItem_label' >old password:</label><input type='password' name='newpwd0' />").appendTo( $("<div class='KFormItem'><br></div>").appendTo($div)  );
		
        var $dummy = $("<div style='text-align:left;padding:10px 40px;'>Use your LDAP password or choose another one.<br>Using LDAP is save, it will not be stored in our database.  </div>").appendTo($div);

		var $pw1 = $("<label class='KFormItem_label' >new password:</label><input type='password' name='newpwd1' />").appendTo( $("<div class='KFormItem'><br></div>").appendTo($div)  );
		var $pw2 = $("<label class='KFormItem_label' >repeat new password:</label><input type='password' name='newpwd2' />").appendTo( $("<div class='KFormItem'></div>").appendTo($div) );
		var $submit = $("<label class='KFormItem_label' ></label><input type='submit' name='submit' value='submit' />").appendTo( $("<div class='KFormItem'></div>").appendTo($div) )
				.click(function(){
					if($pw1.next().val() !== $pw2.next().val())
					{
						$errmsg.html("Your must enter the same password twice.");
						return false;
					}
					else if($pw1.next().val().length < 4)
					{
						$errmsg.html("New password is too simple");
						return false;
					}
					else
					{
						that.passwdChange($pw0.next().val(), $pw1.next().val(), function(result) 
						{
						    if(result.custom_success !== undefined && result.custom_success == 0)
						    {
        						$errmsg.html(result.custom_msg).hide().slideDown();
						    }
						    else if(result.custom_success !== undefined && result.custom_success == 1)
						    {
                                alertify.alert(result.custom_msg);
                                $div.remove();
						    }
						});
					}

				});
		
		var $cancel = $("<input type='reset' name='cancel' value='cancel' style='margin-left:50px;' />").appendTo($submit.parent()).click(function(){$div.remove()});

		return
	}

	that.ontoggle = function()
	{
		if(content.modified)
		{
			delete content.modified;
			that.saveChanges();

		}
	}
	
	that.passwdChange = function(oldpasswd, newpwd, whendone)
	{
		ajaxRequest('command=passwordChange&json=' + encodeURIComponent(JSON.stringify([{id:userinfo.ID, oldpasswd:oldpasswd, passwd:newpwd}])) , whendone);
	}


	that.saveChanges = function(onsave)
	{
		function whendone(result)
		{
			if (onsave)
			 onsave();
		}
// 		var userinfo_tmp = $.extend(true,{},userinfo);
// 		delete userinfo_tmp.passwd;
		// do NOT save all fields
		var userinfo_tmp = 
		{
		    id:userinfo.id,
		    forceanonymize: userinfo.forceanonymize,
		    email: userinfo.email,
		    city: userinfo.city,
		    fullname: userinfo.fullname,
		    street: userinfo.street,
		    styletheme: userinfo.styletheme,
		}

		ajaxRequest('command=userTable_save&json=' + encodeURIComponent(JSON.stringify([userinfo_tmp])) , whendone);
	}

    return that;
}



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// resizer, for example for the codemirror
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function addCustomResizer($target, opts_in)
{
    var opts = 
    {
        x:true,
        y:true,
        min_x:20,
        max_x:10000000,
        min_y:20,
        max_y:10000000,
    };
    opts = $.extend(true, opts,opts_in)
    var $resizer = $("<div class='dialog_generic_resizeTriangle'></div>").appendTo($target).mousedown( 
    function()
    {
        $resizer.addClass('dialog_generic_resizeTriangle_hovered');
        $(document.body).on('mousemove', function(ev)
        {
            var newwidth = ev.clientX - $target.offset().left ;
            var newheight = ev.clientY - $target.offset().top ;
            if(newwidth < opts.min_x | newheight < opts.min_y ) 
                return;
            if(newwidth > opts.max_x | newheight > opts.max_y ) 
                return;
            if(opts.x)
                $target.width( newwidth  );
            if(opts.y)
                $target.height( newheight );

        });

        $(document.body).on('mouseup mouseleave', function() 
        {       
            $resizer.removeClass('dialog_generic_resizeTriangle_hovered');   $(document.body).off('mousemove mouseup mouseleave')
        });
        return false;
    });
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Generic Dialog
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function dialog_generic()
{

  // that.$menu       :   the ul menubar. just append your menu here
  // that.$container  :   append your content here
  // that.ontoggle     : add additional functionality to ontoggle button
  // that.$frame     : the outer main frame. this is hidden on toggle
  // that.deleteonclose: delete window on close. default is false;

// ================= resize
  var that = new Object();
  that.$frame =  $("<div class='dialog_generic_frame movableWindows'></div>").appendTo( $(document.body) );
  //that.$frame.click(function(){ that.$frame.appendTo($(document.body))  }) ; //does not work. will steel focus.
   that.$resizer = $("<div class='dialog_generic_resizeTriangle'></div>").appendTo(that.$frame)
     .mousedown( function()
     {

       var $elems = that.$frame.find(".sbox_resizable");
       var scpos = [];
	   for(var k=0; k<$elems.length; k++)
       {				
            var scroll = $elems.eq(k).scrollTop();
            scpos.push( Math.min($elems[k].scrollHeight-$elems[k].clientHeight,scroll));
       }		
       that.$resizer.addClass('dialog_generic_resizeTriangle_hovered');
       $(document.body).on('mousemove', function(ev)
       {
         var newwidth = ev.clientX - that.$frame.offset().left ;
         var newheight = ev.clientY - that.$frame.offset().top ;
         if(newwidth < 200 | newheight < 200 ) return;
         that.$frame.width( newwidth  );
         that.$frame.height( newheight );

         for(var k=0; k<$elems.length; k++)
                    $elems.eq(k).scrollTop(scpos[k]);

       });
       
       $(document.body).on('mouseup mouseleave', function() 
       {       
         that.$resizer.removeClass('dialog_generic_resizeTriangle_hovered');   $(document.body).off('mousemove mouseup mouseleave')

       });
       return false;

   });

   // ============== move
  that.$menuDIV = $("<div class='dialog_generic_menu'></div>").appendTo(that.$frame).mousedown( function(ev) { movableWindowMousedownFn(ev, that.$frame)})

  // why was this? == because of z-index.
  // but leads to jumping to top behaviour... this can b
  /*
  that.$menuDIV.click( function() 
  { 
    var st = that.$container.scrollTop();
   	that.$frame.appendTo($(document.body))  
    that.$container.scrollTop(st);
  } ) ;
  */

  that.$menu = $("<ul class='menu_generic' style=''>").appendTo( that.$menuDIV );
  //$("<li class='menu_generic_disabled' ></li>").appendTo($(ul));

  // set this to true to delete the window completey on close instead of just hiding it
  that.deleteonclose = false;

  // this is the defautl behaviour for click on close button. add additional handles by overwriting ontoggle
  that.ontoggle = function() {return true;};
  that.toggle = function(ev)
  {

   
    var res = that.ontoggle();

    // if the custom toggle fun returns false, abort here, it probably took care of everything (check for unsaved ...)
    if(res === false)
    {
    	return;
    }
    else
    {
        if( that.deleteonclose)
        {
            that.$frame.remove(); 
        }
        else
        {
          //  that.$frame.appendTo($(document.body));
            if (that.$frame.css('display') != 'none')
            {
               that.toggle.scpos = [];
               var scpos = that.toggle.scpos;  
               that.toggle.$elems = that.$frame.find('.sbox_resizable' );
               var $elems = that.toggle.$elems;
               for(var k=0; k<$elems.length; k++)
               {				
                    var scroll = $elems.eq(k).scrollTop();
                    scpos.push( Math.min($elems[k].scrollHeight-$elems[k].clientHeight,scroll));
                  
               }
               that.$frame.hide();        
               if (that.onPastToggle)
                  that.onPastToggle(false)

            }
            else
            {
                that.$frame.show(); 
                var $elems = that.toggle.$elems;
                var scpos = that.toggle.scpos;  
                if ($elems)
                    for(var k=0; k<$elems.length; k++)
                    {				
                        $elems.eq(k).scrollTop(scpos[k]);                          
                    }
                bringToFront(that.$frame)
                if (that.onPastToggle)
                    that.onPastToggle(true)
                return true;
            }

           // that.$frame.toggle();
        }
    }
  }
  that.closebtn = $("<li style='float:right;'> <a><i class='close_button fa fa-close' /></i> </a> </li>").appendTo(that.$menu  ).mousedown( function(ev){  ev.stopPropagation(); that.toggle()} );

  maximizerButton(that.$menu, that.$frame);

  that.$container = $("<div class='dialog_generic_container'></div>").appendTo(that.$frame);

  that.bringToFront = function()
  {
      bringToFront(that.$frame);
  }
  
  that.bringToFront();
  
  return that;
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Generic List / Tab Manager
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function KList(struct)
{
    /* Usage:
    struct.$targetcontainer
    struct.$menucontainer (optional), otherwise use return.$ul
    struct.classes : classic, roundish, vert, inverted, 
    struct.ondelete
    struct.onchange	
    struct.activeID

    example:
    tabber = new KList({classes:["roundish", "classic" ], $targetcontainer: $target})
    tabber.append = (uid, title, function() return($contentdiv), onclick)
    tabber.updateOrSelectByID(id)
    tabber.clear;
    */

	var klm = new Object();
	klm.list = new Object();

	klm.activeID = undefined;

	var $target;

	if(struct.$targetcontainer != undefined)
		settarget(struct.$targetcontainer);

	
	var classes = "KList ";
	if(struct.classes !=undefined)
	{
		for(var k=0; k< struct.classes.length; k++)
		{
			classes +=  " KList_" + struct.classes[k] ;
		}
	}

	// the menu container does already exist, append
	if(struct.$menucontainer)
		klm.$ul = struct.$menucontainer.addClass(classes);
	else
		klm.$ul = $("<ul class='" + classes + "'></ul>");
	

    klm.deselect = function()
    {
        klm.$ul.children().removeClass('active')  
    }


	/**********************************
	set the target where content shall be updated
	**********************************/	
	function settarget($t)
	{
		$target = $t;
	}
	klm.settarget = settarget;


	/**********************************
	reset, when MList becomes empty after deletion of last element
	**********************************/	
	klm.reset = function()
	{
		if( klm.subList  && klm.subList.activeID)
			klm.subList[klm.subList.activeID].trigger('click');		
		
		if($target!=undefined)
			$target.empty();
	}

	/**********************************
	setVisibleGroups
	**********************************/	
	klm.groupsexpanded = {};
    klm.setGroupsExpanded = function(groups)
    {
        if (groups == undefined)
        	klm.groupsexpanded = {};
        else
            klm.groupsexpanded = groups;
    }

	/**********************************
	append items
	**********************************/	
	klm.append = function(uid, title, content, onclick, addons)
	{
		
		/**********************************
		sub-tree with groups
		**********************************/
		var temp = title.split('/');
		if(temp.length>1)
		{
			var group= temp[0];
			var ititle = temp.slice(1).join('/');

			var $li = $("<li class='KListItem KListItem_subitem'><a>"+ititle+"</a></li>").hide();
			var $parent = klm.$ul.find('ul[klist_groupid="'+group+'"]')
			var selstr = "right"
			if(	klm.groupsexpanded[group])
			  selstr = "down";
			if($parent.length==0)
				$("<ul class='KListItem KListItem_subgroup' klist_groupid='"+group+"'></ul>").appendTo(klm.$ul)
				.append( $("<li class='KListItem'><a><i class='fa fa-caret-"+selstr+"' style='float:left'></i><span>"+group+"</span></a></ul>").click(function(){
					$(this).nextUntil().toggle()
					var thestate;
					var $i = $(this).find('i');
					if($i.hasClass('fa-caret-right')){thestate = 1;
					   $i.removeClass('fa-caret-right').addClass('fa-caret-down')}
					else{thestate = 0;
					   $i.removeClass('fa-caret-down').addClass('fa-caret-right')}
					klm.groupsexpanded[group] = thestate;
					if(onclick) 
					    onclick({klistgroup_id: group, klistgroup_state:thestate });
					}
				))
				.append($li);
			else
				$li.appendTo($parent.eq(0));
			if(	klm.groupsexpanded[group])
			    $li.show();
		}
		else
		{
			var $li = $("<li class='KListItem'><a>"+title+"</a></li>").appendTo(klm.$ul);
		}

		if(uid == 'spacer')
		{
			$li.addClass('KListSpacer');
			return $li.appendTo(klm.$ul);
		}

		/**********************************
		deleteable items
		**********************************/
		if(struct.ondelete)
		{
			$("<i class='fa fa-trash'></i>").appendTo($li).click(function(ev){struct.ondelete(uid);ev.stopPropagation();});
		}

		/**********************************
		arbitrary mods
		**********************************/
        if (addons)
            addons(uid,$li);


		$li.uid = uid;
		
		// save the li twice, as shortcut and as dedicated list
		klm[uid] = $li;
		klm.list[uid] = $li;

		/**********************************
		first: run custom handler, e.g. to set a new variable in background
		**********************************/

		/**********************************
		click handler for marking and setting content
		**********************************/
		$li.click( function(uid) { return function()
		{
			
    		if(onclick) 
    		{
			    if ( onclick($li,dothechange) == "donotcall" )
			         return;
			    dothechange();
    		}
    		else
    		  dothechange();


            function dothechange()
            {

                klm.$ul.find('li').removeClass('active')  
                $li.addClass('active');
                klm.activeID = uid;

                // Before clearing the content: If there was a subList set remember its active list element and re-trigger
    // 			var activeID;
    // 			if( klm.subList )
    // 				activeID = klm.subList.$ul.children('.active').uid;
                var newContent = undefined;
                if(typeof content == 'function' )
                    newContent = content(uid);
                else if(content instanceof jQuery )
                    newContent =  content;
                if(newContent != undefined)
                {
                    // careful here: empty will destroy click handlers on objects. Only empty if create function is given for new object
                    if(typeof content == 'function' )
                        $target.empty(); 
                    else if(content instanceof jQuery )    
                        $target.children().detach();

                    $target.append( newContent.hide() );
                    newContent.fadeIn(200);
                }

                if( klm.subList  && klm.subList.activeID)
                     klm.subList[klm.subList.activeID].trigger('click');
            }

		}}(uid));
		
		
		return $li;

	}


	klm.updateOrSelectByID = function(id)
	{
		if (id == undefined)
		{
			// select the active One
			if(klm.activeID!==undefined && klm.list[klm.activeID]!=undefined)
			{
				id = klm.activeID;
			}
			else
			{
				var list = Object.getOwnPropertyNames(klm.list);
				if(list.length > 0 )
					klm.list[list[0]].trigger("click");
			}
		}

		if(id != undefined && klm[id] !=undefined)
				klm.list[id].trigger("click");
	}

	// rebuild the list
	klm.clear = function()
	{
		klm.$ul.empty();
		klm.list = new Object();
	}

	return klm;

}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////// Generic Table Manager (similar to localfiletable)
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function table_generic(opts_in)
{
    /*
    that.$table  
    that.$thead  
    that.$tbody  
    that.appendToHead( [] )
    that.appendToBody( [] )
    */
    
    var opts = 
    {
        selectable: 0,
        checkable: 0,
        checkonclick: 0,
        class_checked: 'selectedGray',
        class_active : 'selected',       
        resizable: 0,
        sortable: 0
    }
    $.extend(true, opts, opts_in)

    var that = new Object();
    var $table = that.$table = $("<table cellspacing=0  class='localfiletable' style=''></table>"); 
    var $thead = that.$thead   = $("<thead></thead>").appendTo($table);
    var $tbody = that.$tbody   = $("<tbody></tbody>").appendTo($table);


	/**********************************
	Append a row to head or body
	**********************************/	
    that.appendToHead =  function(row)
    {
       return that.append($thead, row);
    }
    that.appendToBody = function(row)
    {
       return that.append($tbody, row);
    }

	/**********************************
	Append a row 
	**********************************/	
    that.append = function($where, row)
    {
        // ***** row is already created from outside
        if(row.jquery)
        {
            var $row = row;
        }
        //******** row is array of values
        else if (row instanceof Array)
        {
            var rowid = "xxx";
            var $row = $("<tr id="+rowid+"></tr>");
            for(var k=0; k<row.length; k++)
            {
                if(row[k] instanceof jQuery)
                {
                    row[k].appendTo( $("<td></td>").appendTo($row) ); 
                }
                else
                {
                    if( row[k]==null || row[k] == undefined)
                        var val  = "";
                    else
                        var val = (row[k]).toString();
    
                    $("<span>"+val+"</span>").appendTo( $("<td></td>").appendTo($row) ); 
                }

            }

        }
        // row is an object --> take the keys
        else if (row instanceof Object)
        {
            var rowid = "xxx";
            var $row = $("<tr id="+rowid+"></tr>");
            for(var k in row)
            {
                if( !(row[k] instanceof Object) && !(row[k] instanceof Array) )
                {
                    if( row[k]==null || row[k] == undefined)
                        var val  = "";
                    else
                        var val = (row[k]).toString();

                    $("<span>"+val+"</span>").appendTo( $("<td></td>").appendTo($row) ); 
                }
            }
        }
        else
        {
            return false;
        }

        if(opts.checkable)
            $("<td ><i class='fa fa-square-o'></i></td>").prependTo($row).click(  function(ev){toggleChecked(ev, $row); return false;}  );	
        
        if(opts.checkable || opts.selectable )
            $row.click( clickOnRow  );

        $row.appendTo($where);
        return $row;
    }
	/**********************************
	clean all
	**********************************/	
    that.clean = function()
    {
        $thead.empty();
        $tbody.empty();
    }


	/**********************************
	clickOnRow
	**********************************/	
    function clickOnRow(ev, callback)
    {
        ev.stopPropagation();
        ev.preventDefault();
        return false;

        if( (ev.shiftKey || ev.ctrlKey) && opts.checkonclick )
        {
            toggleChecked(ev,  $(this) );
            return false;
        }
        else if( opts.selectable )
        {
            setActive( $(this) );
            if(callback)
                return callback()
            else
                return false;
        }
        
    }

	/***************************************************************************************
	* setActive: set the active row 
	****************************************************************************************/
	var $currentfocus;
	function setActive($row)
    {
	    //var $row = $(this);
        $virtualInput.focus();
        $currentfocus = $row;
	    $tbody.find("tr").removeClass(opts.class_active);
	    $row.addClass(opts.class_active);
	}

	/***************************************************************************************
	* clickOnCheck: clicked on the check box or with ctrl/shift on row
	****************************************************************************************/
    function toggleChecked(ev, $row)
    {
        if(ev.shiftKey)
        {
            if($currentfocus == undefined)
                return false;

            var indlast = $currentfocus.index();
            var indthis = $row.index();
            var diff = indthis-indlast;
            if(diff > 0)
            {
                var $cc= $currentfocus;
            }
            else if(diff < 0)
            {
                var $cc= $row;
                diff = -diff;
            }
            for(var x=0; x<=diff; x++)
            {
                //toggleCheckedInternal($cc, indlast.hasClass(opts.class_checked));
                toggleCheckedInternal($cc, ev.ctrlKey);
                $cc = $cc.next();
            }
        }
        else// if(ev.ctrlKey)
        {
            toggleCheckedInternal($row);
        }
        return false;
    }


	/***************************************************************************************
	* toggleChecked: toggle the CHECK Selection
	****************************************************************************************/
	function toggleCheckedInternal($row, force)
	{
		if($row.parent().is('thead'))
		{
			var $allrows = $tbody.find("tr");
			if(!$row.hasClass(opts.class_checked) )
			{
				$row.find('.fa').eq(0).addClass('fa-check-square');
				$row.find('.fa').eq(0).removeClass('fa-square-o');
				$row.addClass(opts.class_checked);
				$allrows.addClass(opts.class_checked);
				$allrows.find('.fa').addClass('fa-check-square');
				$allrows.find('.fa').removeClass('fa-square-o');
			}
			else 
			{
				$row.find('.fa').removeClass('fa-check-square');
				$row.find('.fa').addClass('fa-square-o');
				$row.removeClass(opts.class_checked);
				$allrows.removeClass(opts.class_checked);
				$allrows.find('.fa').removeClass('fa-check-square');
				$allrows.find('.fa').addClass('fa-square-o');
			}
		}
		else
		{
			if(force!==undefined)
				var newstate = force;
			else
				var newstate = $row.hasClass(opts.class_checked);
				  
			if(newstate )
			{
				$row.removeClass(opts.class_checked);
				$row.children().eq(0).find('.fa').removeClass('fa-check-square');
				$row.children().eq(0).find('.fa').addClass('fa-square-o');
			}
			else 
			{
				$row.addClass(opts.class_checked);
				$row.children().eq(0).find('.fa').addClass('fa-check-square');
				$row.children().eq(0).find('.fa').removeClass('fa-check-o');

			}
		}
	}


	/**********************************
	Keyboard move functionality: move up and down 
	**********************************/		
	// put an key event handler to som element, It must have tabindex to work.
	if(opts.selectable)
	{
        $virtualInput = $table;
        $virtualInput.attr("tabindex",-1)
        $virtualInput.on('keyup', keyhandler);
	}
    function keyhandler(ev) 
    {
    	if($currentfocus)
    	{
    		if(ev.keyCode==38 && $currentfocus.prev().length > 0)
    		   		$currentfocus = $currentfocus.prev();
    		else if(ev.keyCode==40 && $currentfocus.next().length > 0)
    		   		$currentfocus = $currentfocus.next();
    		
    		if($currentfocus)
    			$currentfocus.trigger('click');
    	}
        ev.preventDefault();
        return false;
    }


    function createTestTable()
    {
        that.$tbody.empty();
        that.$thead.empty();

        var h  = ["h2", "h3" , "h5"];
        var b1 = ["b2aada", "badada3" , "b5"];
        var b2 = ["b2",  1 , "b5adaa"];
        var b3 = ["b3",  1 , "bdaa"];
        var b4 = ["b524",  1 , "b5adaa"];
        that.appendToHead(h);
        that.appendToBody(b1);
        that.appendToBody(b2);
        that.appendToBody(b3);
        that.appendToBody(b4);

        $table.appendTo($body);
        $table.css('position', 'absolute');
        $table.css('z-index', '1000000000000');
        $table.dblclick( function(){$table.remove()} );
    }
    
    //createTestTable();

    return that;	
}







var scriptLoader = new ScriptLoader();
function ScriptLoader() 
{
	var that = new Object();
	that.scripts = new Array();
	that.loadScript = function(scriptName, whendone)
	{
		//var url = myownurl().substr(0, myownurl().lastIndexOf('/')) + "/" + scriptName;
		var url = url_pref + "/" + scriptName;

        if (url.substring(0,1) == "/")
            url = url.substring(1);

		if(that.scripts[scriptName] === undefined)// & $(document.head).find("#"+scriptName).length ==0 )
		{
			// synchrounus loading  .... no so nice
			//var script = $("  <script type='text/javascript' defer='defer'  id='"+ scriptName +"'></script>").attr('src', url).appendTo(document.head);
			//that.scripts[scriptName] = true;
			// async: hard: must wait in 3D viewer
			$.getScript(url, function()				{ that.scripts[scriptName] = true; if (whendone) whendone();});
		}
		else 		{if(whendone)whendone();}
	}

	return that;
}



function setdragend(ev)
{
  cleanAllDropIndicators();	
/*
  $('.KView_viewportdropIndicator').fadeOut(220, function()
  {
  	//$(this).remove()
  } );
  
  $('.KView_autoloader_dropIndicator').fadeOut(220, function()
  {
  	$(this).remove()
  } );
*/
}


function setdragstart(ev)
{
	/***************************************************************************************
	drop-cancellator
	****************************************************************************************/
	/*
  	var $cancel = $("<div class='dropindicator_general_vert body_dropindicator' style=''></div>").hide().appendTo($body).fadeIn(150);
  	setPixelPosition($cancel, [1,1, 300,100], 0);
  	var $cancelInner = $("<div style='background:rgba(255, 139, 0, 0.9);padding:10px 20px;'>Dragged by accident? <br><br>Drop here to cancel drop.</div>").appendTo($cancel);
  			$cancelInner.on("dragenter dragover", function(ev)
			{ $(this).css('background', 'rgba(200, 139, 0, 0.9)'); 				ev.preventDefault();ev.stopPropagation();return false; });
			$cancelInner.on("dragleave", function(ev)
			{ $(this).css('background', 'rgba(255, 139, 0, 0.9)');				ev.preventDefault();ev.stopPropagation();return false; });
			$cancelInner.on("drop", function(ev)
			{ $cancel.remove(); cleanAllDropIndicators();				ev.preventDefault();ev.stopPropagation();return false; });
	*/
	
	/***************************************************************************************
	Autoloaders
	****************************************************************************************/
	if(!ev.ctrlKey && ($(ev.target).hasClass("patient") || $(ev.target).hasClass("study")) )
	{ 

		/***************************************************************************************
		the starter
		****************************************************************************************/
		var $start = $("<div class='dropindicator_general_vert body_dropindicator' style='border-radius:5px;'><div>Drag here to show all autoloaders</div></div>").hide().appendTo($body).fadeIn(150);
		var pos = getPixelPosition($("#KView_toolBarLeft").find('.fa-car'));
		setPixelPosition($start, [pos[0]-00,pos[1]-100, 180,150], 0);
				$start.on("dragenter dragover", function(ev)
				{ $start.remove(); showAutoloaderIndicators(); 			ev.preventDefault();ev.stopPropagation();return false; });

		function showAutoloaderIndicators()
		{
			var $frame = $("<div class='KView_autoloader_dropIndicator' style=''></div>")
				.offset(KViewer.$container.offset()).width(KViewer.$container.width()).height(KViewer.$container.height());

			$("<div><span style='font-size:30px'>AUTOLOADERS</span><br><br><span>Drop patient or study to start an autoloader<br>You can add / remove / manage autoloaders using the autloader menu</span></div>").appendTo($frame);

			var $list = $("<div></div>").appendTo($frame);
			var plist = presetManager.getPresetList();
			var keys = Object.getOwnPropertyNames(plist);
			keys.unshift("0");
			for(var z=0; z<keys.length; z++)
			{	
				var k = keys[z];
				if(k=="0")
				{
					var preset = state.viewer;
					var title = "<b>currentSnapshot</b>";
				}
				else
				{
					var preset = plist[k].content;
					var title = preset.name;
				}

				if(1)//preset.autoloaders.length > 0)
				{
					var str = "" ;

					str += "<div>" + title + "</div>";
					str += "<div>"; 
					//str += "Viewports: <b>" + preset.nVisibleRows + " x " + preset.nVisibleCols +" | " + preset.nVisibleBarports + "</b><br />";
					str += "<b>" + preset.nVisibleRows + " x " + preset.nVisibleCols + "</b><br />";
					for(var i=0; i<preset.autoloaders.length;i++)
						str += "<span style='font-size:12px;color:gray'>"+ preset.autoloaders[i].pattern.slice(0,20) + "...<span> <br />" ;
					str += "</div>";

					var $item = $("<div>"+ str +"</div>").appendTo($list);
					// this must be set, otherwise drop will not work!!!
					$item.on("dragenter dragover", function(ev)
					{ $(this).css('background', 'rgba(190, 0, 0, 0.6)'); 				ev.preventDefault();ev.stopPropagation();return false; });
					$item.on("dragleave", function(ev)
					{ $(this).css('background', 'rgba(139, 0, 0, 0.6)');				ev.preventDefault();ev.stopPropagation();return false; });
					$item.on("drop", creatDropFunction(preset));
					function creatDropFunction(p)
					{
						return function(evd)
						{
							evd.preventDefault(); evd.stopPropagation();
							var psid = {piz:($(ev.target)).attr('data-piz'),sid:($(ev.target)).attr('data-sid')};
							
							state.viewer.nVisibleCols =  p.nVisibleCols;
							state.viewer.nVisibleRows =  p.nVisibleRows;
							state.viewer.nVisibleBarports =  p.nVisibleBarports;
							KViewer.applyNewViewportLayout();
							
							startAutoloader(p.autoloaders, psid);
							cleanAllDropIndicators();
							return;
						}
					}


				}
			}
			$frame.appendTo(document.body);
		}
	}



  // comes from the roiPanel
  if($(ev.target).parents('.roiToolContainer').length > 0 )
  {
  	 ev.dataTransfer.setData("fromroitool","yea");
  }

  if ($(ev.target).hasClass("formtable"))
  {
  	 ev.dataTransfer.setData("form","");
  	 ev.dataTransfer.setData($(ev.target).attr("data-fileid"),"");
  }
  else
  {
	  prepObjectInfo(ev.target);

	  // drag from file cacheManager
	  if ($(ev.target).hasClass("filecache"))
	  {
		  if(ev.originalEvent!== undefined)
			   ev.originalEvent.dataTransfer.setData("fromcachetable","yea");
		  else
			   ev.dataTransfer.setData("fromcachetable","yea");
	  }

      if(ev.originalEvent!== undefined)
           ev.originalEvent.dataTransfer.setData("fromfiletable","yea");
      else
      {
           ev.dataTransfer.setData("fromfiletable","yea");
//           var fi = myownurl() + '?asuser=' + userinfo.username + "&project=" + projectInfo.name + "&fileID=100";
//           ev.dataTransfer.setData("DownloadURL",fi);
      }

	  for (var p in tempObjectInfo[0])
		  ev.dataTransfer.setData(p,tempObjectInfo[0][p]);// just needed for backward compatability (still have to change drop in Kviewports)
	  buildDragImg(ev);

  }

  var fromTool = $(ev.target).parents('.annotation_tool_listDIV');
  if (fromTool.length>0)
  {
     patientTableScrollLock($(fromTool[0]));
  }
  else
  	patientTableScrollLock($("#patientTableWrap"));


}



/***************************************************************************************
*  Interprets/packs selection in patient table
****************************************************************************************/
 // gathers selection if target coincides with selected target,
 // or if target is undefined it gives just the selected objects
function prepObjectInfo(target)
{

   var type = 'patientTable';
   if (target != undefined)
   {
   	if  ($(target).hasClass('filecache'))
   	    type = "filecache";
   }

  if (type == "filecache")
  {
  	   var selected = $(target).parent().find(".selected")
  	   if (selected.length==0)
  	   {
  	   	  tempObjectInfo = [packObjectInfo(target)];
  	   }
  	   else
  	   {
  	   	  tempObjectInfo = new Array();
          for (var k = 0; k < selected.length;k++)
			 tempObjectInfo.push(packObjectInfo(selected[k]));
  	   }

  }
  else  // this is putativey the patientable
  {
	  var rowid = $(target).attr("id");
	  if (rowid) rowid = rowid.toString();
 
	  tempObjectInfo = new Array();
	  if (typeof patientTableMirror != "undefined")
	  {
          if (target == undefined | patientTableMirror.filesSelected.objs["x"+rowid] != undefined) // gather files
              prepObjectInfoFromFileSelection(rowid);
          if (target == undefined | patientTableMirror.selectedItems.indexOf(rowid) != -1)         // gather patients/   studies??
              prepObjectInfoFromPatientSelection();
	  }
	  if (tempObjectInfo.length>0)
		 return;


	  tempObjectInfo = [packObjectInfo(target)];
  }
}


function prepObjectInfoFromFileSelection(pointed_rowid,target)
{

      if (target == undefined)
        target = tempObjectInfo;
      if (target == undefined)
      {
        console.warning("target not initizalied!!")
      }

	  function addtoTempObjectInfo(rowid)
	  {
		  var therow = $("tr[id='" + rowid.substring(1) + "']");
		  if (therow.length>0)
			target.push(packObjectInfo(therow));
	  }

  	  addtoTempObjectInfo("x"+pointed_rowid);

      for (var rowid in patientTableMirror.filesSelected.objs)
	  	 if (patientTableMirror.filesSelected.objs[rowid] != undefined & "x"+pointed_rowid != rowid)
	  	 	addtoTempObjectInfo(rowid)
}

function prepObjectInfoFromPatientSelection(target)
{
      if (target == undefined)
        target = tempObjectInfo;
      if (target == undefined)
      {
        console.warning("target not initizalied!!")
      }


  	  for(var i=0;i<patientTableMirror.selectedItems.length;i++)
  	  {
  	  	var therow = $("tr[id='" + patientTableMirror.selectedItems[i] + "']");
  	  	if (therow.length>0)
		 	target.push(packObjectInfo(therow));
		else
		{
			if (state.viewer.selectionMode[1] == 'p')
				target.push({type:'patient',piz:patientTableMirror.selectedItems[i]})
			else
			{
				var ids = patientTableMirror.selectedItems[i].split(riddelim);
				target.push({type:'study',piz:ids[0],sid:ids[1]});				
			}
		}
  	  }
}

function packObjectInfo(target)
{
	var $target = $(target);
	var fname;
	if ($target.attr('data-subfolder') == undefined | $target.attr('data-subfolder')=="" )
		fname = $target.attr('data-filename');
	else if ($target.attr('data-filename') == undefined | $target.attr('data-filename')=="" )
		fname = $target.attr('data-subfolder');
	else
		fname = $target.attr('data-subfolder') + "/"+ $target.attr('data-filename');

	// find the patient name
	if(state.viewer.selectionMode[1]=="p" && $target.attr('rowid_parent')!="")
		var namecat = ($('#patientTable').find('[id="'+$target.attr('rowid_parent')+'"]')).eq(0).find('.td_NameCat').text().substr(6).trim();
	else
		var namecat = $target.find('.td_NameCat').text().substr(6).trim();

	return {type: $target.attr('data-type'),
		 sid:  $target.attr('data-sid'),
		 piz:   $target.attr('data-piz'),
		 namecat: namecat,
		 subfolder:   $target.attr('data-subfolder'),
		 tag:   $target.attr('data-tag'),
		 intent:   $target.attr('data-intent'),
		 filename: fname,
		 fileID:  $target.attr('data-fileid'),
		 mime:  $target.attr('data-mime'),
	//		 fileURL: $target.attr('href'),
		 rowid: $target.attr("id"),
		 date:$target.attr("data-date")
		 } ;
}





function loadOrthoview(params,offset,cb)
   {

       var vp,sl;
       if (ViewerSettings.nVisibleVertports > 0)
       {
            vp = [20,0,2];
            sl = [2,0,1];
       }
       else
       {
            vp = [0+offset,1+offset,2+offset];
            sl = [1,0,2];
       }

       
	   loadingQueue.execQueue([
		 //$.extend(true,{intent: {viewportID:3+offset,slicing:2,gl:true}},params),
		 $.extend(true,{intent: {viewportID:vp[0],slicing:sl[0],gl:false}},params),
		 $.extend(true,{intent: {viewportID:vp[1],slicing:sl[1],gl:false}},params),
		 $.extend(true,{intent: {viewportID:vp[2],slicing:sl[2],gl:false}},params)
		  ],
		 function () { signalhandler.send(" reslice positionChange"); 
                       if (cb) 
                        cb();
		 } );

   }


function binsearch(fun,target,lower,upper,tolerance)
{
    var current;

    function search(low,up)
    {
        current = (low+up)*0.5;
        var dif = fun(current)-target;
        if (Math.abs(dif) < tolerance)
            return;
        else
        {
           if (dif < 0)
             search(current,up)             
           else 
             search(low,current)
        }
    }

    search(lower,upper);

    return current;

}

function createMetaIndex(name,index,type,level, shared)
{					

    var jsonString = JSON.stringify({name:name,index:index,type:type,level:level, shared: shared});
    ajaxRequest('command=addMetaIndex'+'&json=' + jsonString , function(e) {
        state.metaindices = e.metaindices; 
        refreshButton();
    });
}



function attachWheelHandlerBrowserSafe(target, wheelhandler)
{

// mousewheel handling depends on browserWheelType
// since we do not support IE lower than 8, it is best to add  both mousewheel and DOMMouseScroll directly
// this should also be done, since removal of the handlers doe NOT work using when passing the functio as an argument.
// Another aspect:
// removal of handlers does NOT work with this secondary function!
//  
/*
    // jquery object
    if(target.get)
        target = target.get(0);

    if (target.addEventListener) 
    {
        // Firefox
        if (/Firefox/i.test(navigator.userAgent))
            browserWheelType = "DOMMouseScroll";
        // IE9+, Chrome, Safari, Opera
        else
            browserWheelType = "mousewheel";
    }
    else
    {
        // // IE 6/7/8
        browserWheelType = "onmousewheel";
    }
    $(target).on( browserWheelType,  wheelhandler)
    

    // removal will NOT work
    //$(target).off(browserWheelType,  wheelhandler)
*/
}

function getWheelDelta(ev)
{
    ev = ev || ev.originalEvent;
    return (ev.wheelDelta || -ev.detail ) > 0? 1:-1;
}


function getOnParentPath(obj,condition,depth)
{
    if (depth == undefined)
        depth = 5;

    var d = 0;
    while (!condition(obj) &  d < depth)
    {
        obj = obj.parent();
    }

    if (d<depth)
        return obj;
}


function createDummyNifti(sizes,bbox_max,bbox_min,perm,flip)
{
	  var voxsz = [0,0,0,1];
 	  for (var i=0; i< 3;i++)
 	  	 voxsz[i] = (bbox_max[i]-bbox_min[i])/sizes[i];

  
	  var edges = math.matrix(math.diag(voxsz));
 	  

      for (var i = 0;i < 3;i++)
		   edges._data[i][3] = +bbox_min[i];
	  	

	  var nii = {
		  edges: edges,
		  voxSize: voxsz,
		  sizes: sizes,//  newsizes,
		  permutationOrder:perm,
		  arrayReadDirection:flip, 
		  dummy:true,
		  detsign:math.sign(math.det(edges))
	   }
	return nii;
}


function ignoreDblClickBeforeClose(ev)
 {
			var $target = $(ev.target);
			for (var j = 0; j< 4;j++)
			{
				if ($target.is("tr"))
					$target.attr("ondblclick","");
				$target = $target.parent();
			}
 }

 function setAutoSelectAllOnFocus($elem)
 {
     $elem.on('focus', function() {  setTimeout(function() { document.execCommand('selectAll', false, null)  }, 0); })
 }



/***************************************************************************************
create timestamp in sql date format YYYY-MM-DD hh:mm:ss
****************************************************************************************/
function createSQLDate()
{
    var d = new Date();
    var YYYY = d.getFullYear().toString();
    var MM = (d.getMonth()+1).toString();
    var DD = (d.getDate()).toString();
    var hh = (d.getHours()).toString();
    var mm = (d.getMinutes()).toString();
    var ss = (d.getSeconds()).toString();
    var out =     YYYY + "-" 
                + (MM.length==2?MM:"0"+MM) + "-" 
                + (DD.length==2?DD:"0"+DD) + " " 
                + (hh.length==2?hh:"0"+hh) + ":" 
                + (mm.length==2?mm:"0"+mm) + ":" 
                + (ss.length==2?ss:"0"+ss) + "" 
    return out;
}


function cloneCanvas(canvas,clipbox)
{
    var $c = $("<canvas> </canvas>");

    var ctx = $c[0].getContext("2d");


    if(clipbox)
    {
        var ax = clipbox[0]*canvas[0].width/100;
        var ay = clipbox[1]*canvas[0].height/100;
        var bx = (100-clipbox[2])*canvas[0].width/100;
        var by = (100-clipbox[3])*canvas[0].height/100;
        ctx.canvas.width = canvas[0].width*(clipbox[2]-clipbox[0])/100
        ctx.canvas.height = canvas[0].height*(clipbox[3]-clipbox[0])/100
    }
    else
    {
        var ax=0; var ay=0; var bx=0; var by=0;
        ctx.canvas.width = canvas[0].width
        ctx.canvas.height = canvas[0].height
    }


    ctx.drawImage(canvas[0],ax,ay,ctx.canvas.width,ctx.canvas.height,
    0,0,ctx.canvas.width,ctx.canvas.height)
    return $c;
}


function getTicks(a,b)
{
    function fix(x,order)
    {
        if (Math.abs(order) > 3)
            return x.toFixed(1) + "e" + order;
        else
        {
            if (order > 0)
                return ""+ (x*Math.pow(10,order)).toFixed(0);
            else
                return ""+ (x*Math.pow(10,order)).toFixed(-order+1);
        }
    }

    if (a > b)
    {
        var tmp = a;
        a = b;
        b = tmp;
    }

    var order = Math.floor(Math.log10(b-a));
    a = a*Math.pow(10,-order)
    b = b*Math.pow(10,-order)
    //console.log(b-a);    
    var ticks = [];
    var pos = [];

    var thres = [ 8, 6,   3.2, 1.5, 0 ];
    var fu =    [ 1, 4/3, 2,   5  , 10];

    for (var j = 0; j < thres.length;j++)
    {
        if (b-a > thres[j])
        {
            var aa = (Math.floor(a*fu[j])/fu[j]);
            var bb   = (Math.ceil(b*fu[j])/fu[j]);
            var nsteps = ( (bb-aa) * fu[j]).toFixed(2);
            for (var k = 0; k <= nsteps;k++)
            {
                var zz = Math.floor(a*fu[j]+k)/fu[j];
                ticks.push(fix(zz,order));
                pos.push(zz*Math.pow(10,order));
            }

//             for (var k = 0; k <= (end-start)*fu[j] ;k++)
//             {
//                 ticks.push(fix(Math.floor(a*fu[j]+k)/fu[j],order));
//                 pos.push((a*fu[j]+k)/fu[j]*Math.pow(10,order));
//             }
            break;
        }
    }
    return {ticks:ticks,position:pos};
}
/*
function test()
{
    var t = [];
    var v = [];
    for (var k = 1; k < 10;k+=1)
    {
        t.push(getTicks(-k/2,k/2).length)
    }
    console.log(t)
}*/




/********************************************************
  SBOX: box with resizable elements, see above and css.
********************************************************/
var sbox = {};
sbox.appendResizer = function appendResizer($a, callback)
	{
		if($a.parent().hasClass('sbox_vert'))
			var type = 'resizer_vert';
		else
			var type = 'resizer_horz';


		//var $v =  $("<div class = '"+type+"'></div>").appendTo($a);
		var $pc =  $("<div class = '"+type+"_placeholder'></div>").insertAfter($a);
		var $v =  $("<div class = '"+type+"'></div>").appendTo($pc);

	
		//********************************************************
		$v.mousedown(function(ev)
		{
			var $elems = $a.parent().children('.sbox_resizable' );
			$v.addClass('resizer_hovered');

            var diff;
			//console.log($elems);
			var sizes = [];
			var scpos = [];

			var wtot = 0;
			var htot = 0;
			var nelems = $elems.length;
			var ind = 0;
			for(var k=0; k<$elems.length; k++)
			{
				if(type == 'resizer_horz')
					var siz = $elems.eq(k).width();
				else
					var siz = $elems.eq(k).height();
				sizes.push(siz);
				wtot += siz;

				if( $a.get(0) == $elems.get(k) )
					ind = k;

				var scroll = $elems.eq(k).scrollTop();
				scpos.push( Math.min($elems[k].scrollHeight-$elems[k].clientHeight,scroll));
					
			}
			if(type == 'resizer_horz')
				var startDiff = -ev.clientX;
			else
				var startDiff = -ev.clientY;
			if(type == 'resizer_horz')
			{
				var w1 = $elems.eq(ind).width();
				var w2 = $elems.eq(ind+1).width();
			}
			else
			{
				var w1 = $elems.eq(ind).height();
				var w2 = $elems.eq(ind+1).height();
			}


		    //********************************************************
		    $body.mousemove(function(ev)
			{
				if(type == 'resizer_horz')
					diff = startDiff + ev.clientX;
				else
					diff = startDiff + ev.clientY

				var wnew1 = w1 + diff;
				var wnew2 = w2 - diff;
				if(wnew1<1 || wnew2 <1)
					return;

				sizes[ind] = wnew1;
				sizes[ind+1] = wnew2;

	
				for(var k=0; k<$elems.length; k++)
				{
					if(type == 'resizer_horz')
					{
						$elems.eq(k).width( sizes[k] );
					}
					else
					{
						$elems.eq(k).height( sizes[k] );
						$($elems[k]).find(".sbox_resizable").height(sizes[k])
					}

				}

				for(var k=0; k<$elems.length; k++)
				{
					if(type == 'resizer_horz')
					{
						$elems.eq(k).scrollTop(scpos[k]);
					}
				}
				
				if(callback)
				    callback()

			});

			//********************************************************
			$body.on('mouseup mouseleave', function(ev)
			{
				$(document.body).off('mousemove mouseup mouseleave');
				$v.removeClass('resizer_hovered');

			});
		});

	}



function isDragFromFileTable(ev)
{
  for(var i=0;i<ev.dataTransfer.types.length;i++)
      if (ev.dataTransfer.types[i] == "fromfiletable")
      	  return true;
  return false;
}

function isDragFromBatchtool(ev)
{
  for(var i=0;i<ev.dataTransfer.types.length;i++)
      if (ev.dataTransfer.types[i] == "frombatchtool")
      	  return true;
  return false;
}

function isDragFromCacheTable(ev)
{
  for(var i=0;i<ev.dataTransfer.types.length;i++)
      if (ev.dataTransfer.types[i] == "fromcachetable")
      	  return true;
  return false;
}

function isDragFromHostSystem(ev)
{
  if (ev.originalEvent)
  	ev = ev.originalEvent;

  for(var i=0;i<ev.dataTransfer.types.length;i++)
      if (ev.dataTransfer.types[i] == "Files")
      	  return true;
  return false;
}

function isDragFromRoiTool(ev)
{
  for(var i=0;i<ev.dataTransfer.types.length;i++)
      if (ev.dataTransfer.types[i] == "fromroitool")
      	  return true;
  return false;
}



/***************************************************************************************
*  global key event listener
***************************************************************************************/

function addKeyboardShortcuts()
{
    var lastmove,lastmove_sincekey
    document.addEventListener("mousemove",function(evt) 
    {
        lastmove = evt;
    })

    document.addEventListener("keydown",function(evt) 
    {

            lastmove_sincekey = lastmove
            if(evt.keyCode == 89 || evt.keyCode == 88 )
            {
                if(!evt.shiftKey && evt.target == document.body && KViewer)
                {
                    var mv = KViewer.findMedViewer(function(mv) { return mv.viewport.hasMouse });
                    if (mv == undefined)
                        mv = KViewer.findMedViewer(function(mv) { return true });
                    if (mv == undefined)
                    {
                        return false;
                    }
                    else
                    {
                        mv.handleSliceChange(mv.getSlicingDimOfArray(),1,(evt.keyCode == 88)?1:-1);                        
                    }
                    evt.stopPropagation();
                    evt.preventDefault();
                    return false;   
                }
            }
    });

    document.addEventListener("keyup",function(evt) 
    {
            if (evt.keyCode == 16 && lastmove == lastmove_sincekey && lastmove != undefined)
            {
                var $obj = $(lastmove.target)
                for (var k = 0; k < 4; k++)
                {
                    if ($obj.is("td"))
                        break;
                    $obj = $obj.parent();
                }

                if ($obj.hasClass('fileCell') | $obj.hasClass('studyCell') | $obj.hasClass('patientCell')) 
                {
                    //console.log($obj)
                    patientTableContextMenu(lastmove,true)
                }
            }


    });

    document.addEventListener("keyup",function(evt) 
    {

      evt = evt || window.event;

    // a reading is enabled, overwrite this handler
    if(typeof KViewer.readingTool != "undefined" && KViewer.readingTool.isinstance && KViewer.readingTool.readingIsActive)
    {
        var res = KViewer.readingTool.handleKeyEvent(evt);
        if(!res)
            return false;
    }

      if (false & state.viewer.selectionMode[0] == "w")
      {
        if (!$(evt.target).is("input"))
        {
          if (evt.keyCode == 40) {
            var nextStudy = $("tr[id="+patientTableMirror.selectedItems[0]+"]").next();
            while (!nextStudy.hasClass("study") & nextStudy.length != 0) nextStudy = nextStudy.next();
            if (nextStudy.length==0)
                return;
            patientTableMirror.tree_click({},nextStudy.attr("id"));
          }
          if (evt.keyCode == 38) {
            var nextStudy = $("tr[id="+patientTableMirror.selectedItems[0]+"]").prev();
            while (!nextStudy.hasClass("study") & nextStudy.length != 0) nextStudy = nextStudy.prev();
            if (nextStudy.length==0)
                return;
            patientTableMirror.tree_click({},nextStudy.attr("id"));

          }
        }
      }

      // ESC key
      if (evt.keyCode == 27) {

          if (typeof projectInfo != "undefined" && projectInfo.rights && projectInfo.rights.batchtool == "on")
          {
              if (commandDialog && commandDialog.$frame && commandDialog.$frame.css("display") != "none")
                 commandDialog.toggle();
              if (gridjobsDialog.$frame.css("display") != "none")
                 gridjobsDialog.toggle();
          }
          if ($(".patientTableContextmenu").css("display") != "none")
             $(".patientTableContextmenu").remove();
          if (typeof settingsDialog != "undefined" &&  settingsDialog.dialog != undefined)
              if (settingsDialog.dialog.$frame.css("display") != "none")
                settingsDialog.dialog.toggle();
          if (typeof userSettingsDialog != "undefined"  && userSettingsDialog != undefined)
              if (userSettingsDialog.$frame.css("display") != "none")
                userSettingsDialog.toggle();

      }

        /***************************************************
         key schortcuts:
        ***************************************************/
        if(evt.target == document.body && KViewer)
        {
            //console.log(evt.keyCode);
            //numbers 1 to 9: adjust contrast (keycode 48 to 57)

			if(typeof ktagpanel != "undefined" && ktagpanel && ktagpanel.enabled)
			{
				if( ktagpanel.handleKeyEvent(evt) )
					return 
			}

            if( evt.keyCode >= 48 && evt.keyCode < 57)
            {
                KViewer.iterateMedViewers(function(medviewer)
                {
                    if(medviewer.nii)
                    {
                        var p = colormap.colorlimpresets;
                        var num = (evt.keyCode - 48);
                        if(p[num])
                        {
                            medviewer.resetColorMapLims( [p[num].min, p[num].max   ]   );
                            $("<div class='KViewPort_sliceOutsideRange'>"+ p[num].title +"</div>").appendTo(medviewer.viewport.$container).fadeOut(1450, function(){$(this).remove();}); ;
                        }
                    }
                });
            }
            // y / x: change scroll speed
            else if(evt.shiftKey && (evt.keyCode == 89  || evt.keyCode == 88) )
            {
                var incr = evt.keyCode==88?1:-1;
                KViewer.globalScrollSpeed += incr; 
                if(KViewer.globalScrollSpeed == 0)
                {
                    KViewer.globalScrollSpeed = 1;
                }
                else
                {

                }
                var $stop = $("<div class='KViewPort_sliceOutsideRange' style='padding:15px;'>Scroll Speed: <b>x "+KViewer.globalScrollSpeed  +"</b></div>").appendTo($body).fadeOut(1250, function(){$(this).remove();}); ;

            }
            //************ space bar: toggle roi tool in roi mode
            else if(evt.keyCode == 32)
            {
                if( KViewer.roiTool.isinstance )
                    KViewer.roiTool.toggleCurrentROI()
            } 
            //************ esc: disable roi drawing
            else if(evt.keyCode == 27)
            {
                if( KViewer.roiTool.isinstance &&  KViewer.roiTool.getCurrentGlobal()!=undefined )
                    KViewer.roiTool.makeCurrentGlobal( undefined );
            } 
            //************ up / down arrow in single mode: got next case
            else if(evt.keyCode == 38 || evt.keyCode == 40 )
            {
                {
                    // a reading is enabled
                    if(0)//typeof KViewer.readingTool != "undefined" && KViewer.readingTool.isinstance && KViewer.readingTool.readingIsActive)
                    {
                        KViewer.readingTool.handleKeyEvent(evt.keyCode);
                    }
                    //else if( state.viewer.selectionMode[0] == "w")
                    else if(state.viewer.enableAutoloaders && typeof patientTable_gotoRow != "undefined")
                    {
                        var dir = evt.keyCode == 40?1:-1;
                        patientTable_gotoRow(dir)	
                    }
                    else
                    {

                    }
                }
            }		
            else if(evt.keyCode == 66)
            {
                commandDialog.toggle();
            }	
            else if(evt.keyCode == 83)
            {
                settingsDialog.dialog.toggle();
            }	

        }


    });


}


function waiter(condition,callback,delta,maxtimes)
{
    var t = 0;
    iterate();
    function iterate()
    {
        setTimeout(function() { 
            if (condition())
                callback()
            else 
            {
                t++;
                if (t>maxtimes)
                    callback()
                else
                    iterate();
            }
        },delta);
    }
}



navigationElementsVisible = true;
function hideNavigationElements()
{
	navigationElementsVisible = false;
    $("#patientTableTopTools").hide()
	$("#patientTableToolsWrench").hide()
	$(".KSearchFields").hide()
	$(".KSearchFieldContainer").hide()
	$(".Kcaretmenu").hide()
	$("#patientTableEditMode").show();	
	$(".patientTable_timeMarker").hide();
	$("#patientTableEditModeTextFirst").hide();
	$("#patientTableEditMode").hide();
	$("#topMenu").remove();
	$("#frame").css('padding','0px 0px 0px 0px');

	KViewer.setViewPortLayout()
	setPatientTableLayout();

}

toolBarLeftVisible = true;
function hideAllElements()
{
	toolBarLeftVisible = false;
	KViewer.toggleLeftBar() 
	$("#topMenu").remove();
	$("#KView_toolBarLeft").remove();
	$("#frame").css('padding','0px 0px 0px 0px');

	KViewer.setViewPortLayout()
	setPatientTableLayout();

    
}





function dryimport_Patient(StudyInstanceUID,whendone)
{
     var request = { command:"PACSQuery_dryimport_full_study"  , dryimport:true, StudyInstanceUID:StudyInstanceUID, pacsid:"UKLFR", targetproject:currentModule}
 	 var scripturl  = window.location.href.substr(0, window.location.href.lastIndexOf('/')) + '/pacsquery.php';
     var xhr = ajaxRequest('command=PACSQuery_dryimport_full_study&json=' + encodeURIComponent(JSON.stringify(request))
        , whendone,  scripturl);			
}





function executeExternalCall()
{
    // if (extern_call.suid == undefined)
    //    logout();
         if (extern_call.piz)
         {
             openPatient({PatientID:extern_call.piz,SID:""});
         }
         else if (extern_call.suid)
         {
             var StudyInstanceUID = extern_call.suid;
             SIUID_call(StudyInstanceUID,openPatient);
         }
         else if (extern_call.dcmweb)
         {
             loadDICOMwebURL(extern_call.dcmweb)
             $("#KLoadingFrame").css('display','none')
         }
         else
         {
             $("#KLoadingFrame").css('display','none')
         }



         function SIUID_call(siuid,whendone)
         {


             dryimport_Patient(StudyInstanceUID,function(result)
             {
                if (result.log && result.log.err && result.log.err.length > 0)
                {
                    alertify.error(result.log.err[0]);

                    return;
                }
                if (result.json == undefined)
                {
                    alertify.error("no matching reponse for given SUID");           
                    return;
                }

                var patinfo = result.json[StudyInstanceUID];
                if (patinfo == undefined)
                {
                    alertify.error("no matching entry for given SUID");           
                    return;
                }

                whendone(patinfo)
             });

         }




         function openPatient(patinfo)
         {
                presetManager.applyPresetByName("preset(0)")
              
                patientTable_jumpToRow( patinfo.PatientID + patinfo.SID,currentModule ,function()
                {
   
                    waiter(function() {return KViewer.formManager.loadedFromServer},function()
                    {


                        if (all_patients.length == 0)
                        {
                            alertify.error("patient not found")
                            return;
                        }
                    
                      
                        var autoloader = [{enabled: true, viewportID: 0, 
                                           pattern: "FFilename:recent.json↵FSubFolder:workstates", intent:{}
                                           } ];
                        startAutoloader(autoloader, {piz:patinfo.PatientID , sid: patinfo.SID} , undefined, function() {
                            if (extern_call.hide_nav)
                            {
                                hideNavigationElements();
                                $(".studyRow,.patientRow").css("pointer-events",'none');
                            }
                            if (extern_call.hide_all)
                            {
                               hideAllElements();
                            }
                            $("#KLoadingFrame").css('display','none')
                        });
                        

                    },50,10);

                });
         }


 





}



function KProgressBar(txt,fa,onclose,noprogressinformation)
{
    var progressBar = {};

    var closebutton = "";
    if (onclose != undefined)
        closebutton = "<i class='fa fa-close'>";

    progressBar.$div = $("<div class='KSyncBar'> <i class='fa "+fa+" fa-spin'> </i> <i class='fafa-spin'> </i> " 
                       + " <div class='spinnerbar'> <div class='innerbar'>  </div>  </div> " 
                       + "<span class = 'uploadtext'> "+txt+" </span> "+closebutton+" </div>").appendTo($(document.body));
    progressBar.$div.show(); //fadeIn(1000);
//								  var $download = $div.find(".fa-download");
//								  var $upload = $div.find(".fa-upload").hide();
    progressBar.$bar = progressBar.$div.find(".innerbar").width(0);
    progressBar.$text = progressBar.$div.find(".uploadtext");


    progressBar.$div.find(".fa-close").click(function() {	
                if (onclose)
                    onclose();
				setTimeout(function() {
					progressBar.done("aborted");
				},10)})

	progressBar.progress = function(perc,text)
	{
	    	progressBar.$bar.width(perc + "%");			
			progressBar.$text.text(text);
				
	}
	progressBar.done = function(text)
	{
	    	progressBar.$bar.width("100%");			
			progressBar.$text.text(text);
			progressBar.$div.fadeOut(1500,progressBar.$div.remove);
			if (progressBar.blinker) 
			 clearInterval(  progressBar.blinker);
				
	}
    
    if (noprogressinformation)
    {
        progressBar.blinker_state = 0;
        progressBar.blinker = setInterval(function() {
            progressBar.blinker_state += 2;
            progressBar.blinker_state = progressBar.blinker_state % 100;
            progressBar.$bar.width(progressBar.blinker_state+"%");			
        },50);
    }




    return progressBar;
}




/// elementary ///////////////////////////////////

function union(a,b)
{
	var r = {};
	for (var k in a)
		r[k] = true;
	for (var k in b)
		r[k] = true;
	return r;
}


function union_array(A)
{
	var res = {}
	for (var k = 0;k <A.length;k++)
		for (var j in A[k])
			res[j] = true;
	return res;			
}


function intersect(A,B)
{
	 var C = {};
	for (var x in A)
	{
	if (B[x])
		C[x] = true;
	}
	return C;
}

function diff(A,B)
{
	var C = {};
	for (var x in A)
	{
	  if (B[x] == undefined)
		C[x] = true;
	}
	return C;
}

function intersect_array(A)
{
	var res = {}
	for (var j in A[0])
	{
		var isin = true;
		for (var k = 1;k <A.length;k++)
		{
			if (A[k][j])
				continue;
			else
			{
				isin = false;
				break;
			}
		}
		if (isin)
			res[j] = true;
	}
	return res;

}

function array_to_setObject(A)
{
    var x = {}
    for (var k in A)
        x[A[k]] = true;
    return x;
}


function transpose_array(arr)
{
    var res = [];
    for (var k = 0; k<arr[0].length;k++)
        res[k] = [];
    for (var k = 0; k<arr.length;k++)
    {
        for (var j = 0 ; j < arr[k].length;j++)
        {
            res[j][k] = arr[k][j];
        }
    }
    return res;
}


function KCalcPanel(calcset,inputfiles,pinfo)
{

    



    var panel = KPanel($(document.body), "CalcPanel", "Application panel");
 
    panel.$container.width(400)
    panel.closeOnCloseAll = true
    var $fileRow = $("<div class='roiTool_panel_flex_persistent'></div>").appendTo(panel.$container);


    var buts = $("<div class='modernbuttongroup'></div>").appendTo(panel.$container);
   
    var $recalc = $("<div class='modernbutton small green'><i class='fa fa-refresh'></i> Calculate</div>").appendTo(buts)
    var $save = $("<div class='modernbutton small green'><i class='fa fa-save'></i>Save all </div>").appendTo(buts)
        


    var stats = KViewer.roiTool.computeStats;

    try
    {
      eval(calcset.code);
    }
    catch(err)
    {
        alertify.error("problem in calcpanel code: "+ err.message)
    }

    $("<div class='roiTool_panel_caption'></div>").appendTo(panel.$container);
    var $div = $("<div class='some'></div>").appendTo(panel.$container);



     var inputform = 
       { 
        name 		: "calcform",
        lastchange  : "",
        layout: layout
        
       }    

    var content = {}
    KForm.createForm(inputform, content, $div, function(e) { });

    for (var k in inputfiles)
    {
        if (inputfiles[k] != undefined && inputfiles[k].drawAllPoints != undefined)
        {
            var mset = inputfiles[k];
            var msetpanel = mset.showPanel();
            var $mtable = msetpanel.$container.find(".markerTable")
            var $mtpm = msetpanel.$container.find(".markerTemplates")
            msetpanel.$container.detach();
            $mtpm.appendTo(panel.$container)
            $mtable.appendTo(panel.$container)
            //msetpanel.$container.attr('class','')
        }
    }


    $save.click(function()
    {
       uploadJSON.askonOverwrite =false
       KViewer.roiTool.saveAllROIs();
       var objs = {};
       for (var k in inputfiles)
       {
            if (inputfiles[k].getPointsByName != undefined)
            {
                markerProxy.save(undefined,inputfiles[k]);
      
            }
       }
       uploadJSON.askonOverwrite =true
    


        if (panel.upstr != undefined)
        {
            ajaxRequest('command=createfile&json=' + panel.upstr , function(x)
              {return function(e) {
                  patientTableMirror.mirrorState();
                  alertify.success("json successfully saved")
              } }());
        }




    })



    function doTheCalculation()
    {


       if (panel.$container.css('display') == "none")
       {
              clearInterval(panel.calc_cid);
              return;
       }

       // gather all the object needed for doing the calculations 
       var objs = {};
       for (var k in inputfiles)
       {
           if (inputfiles[k] != undefined)
           {
            if (inputfiles[k].getPointsByName != undefined)
              objs[k] = inputfiles[k].getPointsByName();
            else
            {
              objs[k] = inputfiles[k].content
            }
           }
       }


       try {



            // this evalates the custom code defined in the pane
            // set here a breakpoint for development
            eval(calcset.code);           



            // this does the actual execution of the exec function;
            var obj = exec(objs,pinfo);
            if (obj != undefined)
            {
                content.result = obj.text;
                content.update();
                
                // this compses a json, which can be saved via "save ALL"
                if (obj.json)
                {
                	var tmp = patientTableMirror.getCurrentUniquePSID();
	                var up = {piz:tmp.patients_id,sid:tmp.studies_id};
                    up.content = JSON.stringify(obj.json);
                    up.filename = obj.filename;
                    up.subfolder = "";
                    if (obj.subfolder != undefined)
                        up.subfolder = obj.subfolder;

                    panel.upstr = JSON.stringify(up);


                }

                panel.lasterr = "";
            }


       } catch(err)
       {

          if (panel.lasterr != err.message)         
            alertify.error("problem in calcpanel exec function code: " +err.message)
          panel.lasterr = err.message;

       }
       content.update("result");
    }




    panel.customClose = function()
    {
       clearInterval(panel.calc_cid);
    }


    $recalc.click(function() {  panel.lasterr= ""; doTheCalculation() });

    doTheCalculation();

    panel.calc_cid = setInterval(doTheCalculation,2500);





}



/***************************************************************************************
generic box for a json / text editor
****************************************************************************************/
//we need the struct, field syntax to keep a true pointer
function KJSONEditor(struct, field,  options_in)
{
	var jsoneditor = new Object();

	var options = 
	{
		parseonblur:true,
		log: true,
		editable: 1,
		copybutton:0,
		type: "json"  // can be json or jscode
	}
	$.extend(true, options, options_in);

	var $container = $("<div class='KJSONEditor'></div>")
	//var $codeCheck = $("<div class='modernbutton small green' style='position:absolute;top:0;right:0'><i class='fa fa-check'></i>validate code</div>").click(function(){jsoneditor.JSONparse()}).appendTo($container);

	jsoneditor.$textarea = $("<textarea autocorrect='off' autocapitalize='off' spellcheck='false'>{a:1}</textarea>").appendTo($container);
	
	if(!options.editable)
		jsoneditor.$textarea.attr('readonly', "true")

	jsoneditor.$log = $("<div class='KJSONEditor_log'></div>").appendTo($container);
	//jsoneditor.$applybtn = $("<div class='modernbutton green'>Apply</div>").appendTo($container);


	jsoneditor.$log = $("<div class='KJSONEditor_log'></div>").appendTo($container);

	if(options.copybutton)
	{
		var $copy= $("<div class='modernbutton small gray' style='position:absolute;top:0;right:10px'><i class='fa fa-copy'></i>copy top clipboard</div>")
			.appendTo($container).click( function(){jsoneditor.copyText()} );
	}


	jsoneditor.copyText = function()
	{
		var ta = jsoneditor.$textarea.get(0);
		jsoneditor.$textarea.focus();
		ta.selectionStart = 0;
		ta.selectionEnd = jsoneditor.$textarea.val().length; 
		var successful = document.execCommand('copy');
		ta.selectionEnd = 0;
		if(successful)
  	    	$.notify(" Copied to clipboard","success");

	}


	jsoneditor.pasteText = function(content, selectCopied)
	{
		var $ta = jsoneditor.$textarea;
		ta = $ta.get(0);
		$ta.val($ta.val());
		var s = ta.selectionEnd || $ta.val().length;
		//console.log(s);
		$ta.val($ta.val().substr(0, s) + "" + content + "" + $ta.val().substr(s+1));
		if(selectCopied)
		{
			ta.selectionStart = s;
			ta.selectionEnd = s + content.length;
		}
		$ta.focus();
	}
	
	jsoneditor.JSONstringify = function()
	{
		if(options.type !== "jscode")
			var str = myJSONStringify(struct[field], "", 0);
		else
			var str = struct[field];
			
		jsoneditor.$textarea.val(str);
		return str;
	}

	jsoneditor.JSONparse = function(forceEval)
	{
	  jsoneditor.$log.html("");
	  var ret = false;
	  try
	  { 
	  	   // keep comments and linebreaks: to be implemented
// 	  	   var txt = jsoneditor.$textarea.val();
// 			var pos = txt.indexOf("//");
// 			var lastline;
// 			while(pos > -1) 
// 			{
// 				 pos = txt.indexOf("//", pos+1);
// 			}
			var text = jsoneditor.$textarea.val() ;
			// JSON in javascript has the convention that all \ must be escaped, otherwise they will be removed in eval
			// However, we want to be able to write "lazy" in the code, so escape \ here manually.
			//text = text.replace(/\\/g , "\\\\");
			// but only single bslahes (not followed by another \) and NOT \" (this is an escape seq)
			text = text.replace(/(\\)(?=[^\\"])/g , "\\\\");
			// escaped doble quotes \" in json need some special treatment ...?
			// text = text.replace(/\\"/g , '\\\\"');
			if(options.type !== "jscode")
			{
				if( struct[field] instanceof Array)
					text = "[" + text + "]";
				else //if( struct[field] instanceof Object)
					text = "{" + text + "}";

				eval('var parsed  = ' + text );
				struct[field] = parsed;
				jsoneditor.JSONstringify();
			}
			// this will run the code directly. Difference is, that code is not an object or array, but does return
			else
			{
				struct[field] = text;
				if(forceEval)
					eval(text);
			}
			jsoneditor.$log.html("Code seems to be correct").css('color','green');
			ret = true;
	  }
	  catch(err)
	  {
		  jsoneditor.$log.html("Error: " + err).css('color','red');
		  //jsoneditor.JSONstringify();
	  }
	  return ret;
	}
	
	jsoneditor.getJSONtxt = function()
	{
		return jsoneditor.$textarea.val();
	}

	// enable tab stops in textarea
	jsoneditor.$textarea.on("keydown", function(e)
	{
        if(e.keyCode==9 || e.which==9){
            e.preventDefault();
             	var s = this.selectionStart;
            	this.value = this.value.substring(0,this.selectionStart) + "\t" + this.value.substring(this.selectionEnd);
            	this.selectionEnd = s+1; 
            }

    });


	jsoneditor.JSONstringify();

	if(options.parseonblur)
		jsoneditor.$textarea.on("blur", function(){jsoneditor.JSONparse()} );

	jsoneditor.$container = $container; 
	return jsoneditor;
}



function loadDICOMwebURL(urlstr)
{
// small
//https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.2.840.113619.2.66.2158408118.16050010109105933.20000
//https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.3.6.1.4.1.25403.345050719074.3824.20170125112931.11/series/1.3.6.1.4.1.25403.345050719074.3824.20170125112931.16
//https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.2.392.200140.2.1.1.1.2.799008771.2448.1519719572.518


   // client.searchForStudies().then(studies => {
      //console.log(studies)
   // });
  //  client.searchForSeries().then(studies => {
  //    console.log(studies)
 //    });

    try {

        var x = urlstr.split("/studies/");
        var url = x[0];
        x = x[1].split("/series/");
        var serUID = x[1];
        var stuUID = x[0];
    }
    catch(err)
    {
        alertify.error("wrong dicomweb url format");
        return;
    }

    const client = new DICOMwebClient.api.DICOMwebClient({url});
    var retrieve;
    var progress = function(w)  {   KViewer.cacheManager.progressSpinner("dicomweb: "  + Math.round(w.loaded/1000000) + " MB loaded")   }

    var receive = function (studies) {              
      var params = []

      TheDicomReader = new DicomReader();
      for (var k = 0;k < studies.length;k++)
      {
          var p = {}
          p.URLType = 'localfile';
          p.fileID = "lklk"
          p.filename = "lklk"
          p.buffer = new Uint8Array(studies[k]);
          p.progressSpinner = KViewer.cacheManager.progressSpinner
          params.push(p);
      }
      TheDicomReader.loadDicoms(params,
                function (loadparams)
                {
                    for (var k = 0; k < loadparams.length;k++)
                    {
                            if (loadparams[k].buffer != undefined)
                                KViewer.dataManager.loadData(loadparams[k]);
                    }

                    KViewer.cacheManager.update();

                },KViewer.cacheManager.progressSpinner);

   }


    function onerr(e)
    {
        alertify.error("problem during dicom receive: " + e);
    }


    if (serUID == undefined)
        client.retrieveStudy({studyInstanceUID: stuUID, progressCallback: progress }).then(receive).catch(onerr)
    else
        client.retrieveSeries({studyInstanceUID: stuUID, seriesInstanceUID:serUID, progressCallback: progress }).then(receive).catch(onerr)



}






// ======================================================================================
// ======================================================================================
// ============= TagPanel
// ======================================================================================
// ======================================================================================
KTagPanel = function()
{
	var that = new Object();
	/* major functions of use:
		- add tags to patient,study files
		- hold some custom tags per project
			copy from all possible, trash can do delete, edit with form
		- hold full list of possible tags (from database)
		- in single/autoload mode, 
			show tags of selected item
			allow to toggle tag with one click on tag

		- drag and drop: can dragdrop tag to table or viewer, or can dragdrop item to tag (maybe less nice)
			=> good option for tagging files
		
		- keyboard shortcuts: tag with numbers or similar
			how to distinguish patient/files?

		- options for	
			shortcuts enabled/disabled
			patient/study/file tag mode (better without, make dependent )
			sizes ( for drag/drop )

		-what to do when item has tags not not in customList
			=> must expand / keep 2 lists
		- re-render on every selection	

	*/
	that.enabled = true;


	/******************************************************************
	* build the tool
	*******************************************************************/
	if(ktagpanel != undefined)
	{
		ktagpanel.show();
		return;
	}
	ktagpanel = that;
	var $container = $("<div id='KTagPanel"+"' class='markerPanel movableWindows' style='width:auto; min-width:150px;'></div>").appendTo($(document.body));


	var pp = getPixelPosition($(document.body));
	//$container.position({left:"10px", top:"450px"})
 	$container.css("left", "10px")
 	$container.css("top", "210px"  );

	
	/******************************************************************
	  customize --> these values actually come from the markerset!!
	*******************************************************************/
	that.state = 
	{
		visible:true,
		taglist:
		{
			ptags:{ptest: 1},
			stags:{stest:1},
			ftags:{ftest:1},
		}
	}
	
	// save the taglist in state
	if(state.tagpanel != undefined)
	{
		that.state = state.tagpanel;
	}
	else
	{
		state.tagpanel = that.state;
	}
	
	/******************************************************************
	* close
	*******************************************************************/
	that.close = function()
	{
		$container.hide();
		that.enabled = false;
	}

	
	/******************************************************************
	* close
	*******************************************************************/
	that.show = function()
	{
		$container.show();
		that.enabled = true;
		renderTagList();
	}



	/******************************************************************************
	  tools
	*******************************************************************************/
	var $topRow  = that.$topRow = $("<div class='roiTool_panel_flex persistent' style='background: hsl(206, 64%, 37%); padding:2px;' ></div>").appendTo($container);
	var $caption = $("<span> <b> TagPanel </b></span>");
	var $close = that.$close = $("<i class='KViewPort_tool fa fa-close'></i>").click( that.close );
	$topRow.append($caption).append($("<i class='flexspacer'></i>")).append($close);
	$topRow.mousedown( function(ev) { movableWindowMousedownFn(ev, $container) } );


	/******************************************************************************
	  toggle a stat var
	*******************************************************************************/
	function switch_enabled(prop, force, invert)
	{
		that.state[prop] = typeof(force)!=="boolean"?(that.state[prop]?false:true):force;
		btns["$"+prop][that.state[prop]?"addClass":"removeClass"]('KViewPort_tool_enabled');
		return that.state[prop];
	}
	

	/******************************************************************************
	 build tag colums for patients studies files
	*******************************************************************************/
	$("<div class='roiTool_panel_caption'></div>").appendTo($container);
	var $tagRow    = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
	
	var $tagcontainer = $("<div class='KTagPanel_tagcontainer'></div>").appendTo($container);

	var $ptags = $("<div class=''></div>").appendTo($tagcontainer);
	var $stags = $("<div class=''></div>").appendTo($tagcontainer);
	var $ftags = $("<div class=''></div>").appendTo($tagcontainer);



	var tagmap = [];
	var currentrow_tags;

	var tcols = {};
	var tagtypes = ['ptags','stags','ftags'];

	tcols.ptags = buildCol('PTags');
	tcols.stags = buildCol('STags');
	tcols.ftags = buildCol('FTags');

	renderTagList('ftags')
	renderTagList()

	function buildCol(tagtype)
	{
		var tcol = {};
		tcol.$div = $("<div class='KTagPanel_taglistdiv'></div>").appendTo($tagcontainer);
		tcol.$top = $("<div class='KTagPanel_taglisttitle'><span>"+ tagtype +"</span></div>").appendTo(tcol.$div);
			$("<i class='fa fa-pencil'></i>").appendTo(tcol.$top).click(function(){ editTags(tagtype.toLowerCase())});
		tcol.$tags = $("<div class='KTagPanel_taglist'>"+ "content" +"</div>").appendTo(tcol.$div);
		return tcol;
	}

	/******************************************************************************
	 render taglists for current selection
	*******************************************************************************/
	function editTags(tagtype)
	{
		var $div = $("<div class='KTagPanel_editbox'></div>").appendTo(tcols[tagtype].$top);
		var $dummy = $("<div class=''></div>").appendTo($div);

		var $textarea  = $("<textarea>" + Object.getOwnPropertyNames(that.state.taglist[tagtype]).join("\n") +"</textarea>").appendTo($dummy);
		var $textarea_alltags  = $("<textarea style='background:hsl(0,0%,60%)'>" + Object.getOwnPropertyNames(taglist[tagtype]).join("\n") +"</textarea>").appendTo($dummy);
		

		var $tools = $("<div></div>").appendTo($div);
		$("<div class='modernbutton small blue'>ok</div>").appendTo($tools).click(function(){
			var tobj = {};
			var tlist = $textarea.val().split("\n"); for(var k=0; k<tlist.length; k++){var key =tlist[k].trim(); if(key!="")tobj[key] = 1; }
			that.state.taglist[tagtype] = tobj;
			renderTagList(tagtype)
			$div.remove()
		});
		$("<div class='modernbutton small red'>cancel</div>").appendTo($tools).click(function(){$div.remove()});;
		$textarea.focus();
		//$textarea.get(0).onpaste = function(ev){pastecontent(ev, whichtable)}
		

	}
	/******************************************************************************
	 render taglists for current selection
	*******************************************************************************/
	function renderTagList(tagtype)
	{
		if(tagtype==undefined)
		{
			if(state.viewer.selectionMode[1] == 's')
			{
				tcols.stags.$div.show();
				tcols.ptags.$div.hide();
				tagtype = 'stags';
			}
			else if(state.viewer.selectionMode[1] == 'p')
			{
				tcols.ptags.$div.show();
				tcols.stags.$div.hide();
				tagtype = 'ptags';
			}
		}


		var $target = tcols[tagtype].$tags;
		var xtaglist = that.state.taglist[tagtype];
		/******************************************************************************
		  synchronize with current tags from patient / study
		*******************************************************************************/
		var psid = patientTableMirror.getCurrentUniquePSID();
		// get the list of tags, must 
		var tagmap_ = []
		currentrow_tags = {};
		var ctaglist = {};
		if(tagtype != 'ftags')
		{
			if(psid != undefined)
			{
				var rowid = psid.patients_id ;  
				if(state.viewer.selectionMode[1] == 's')
					rowid += riddelim + (psid.studies_id==undefined?"":psid.studies_id);
				var $row = $("tr[id='" + rowid + "']");
				var $settags =  $row.find('.KTagPatient')//.join( $row.find('.KTagStudy'));
				for(var z=0; z<$settags.length; z++)
				{
					var ctag =  $settags.eq(z).text();
					currentrow_tags[ctag] = 1;
					ctaglist[ctag] = 1;
				}
			}
		}

		$target.empty();
		function appendTag(item, count)
		{
			var $tcont = $("<div class='KTagPanel_tagitem KTagPanel_tagitem_disabled' data-tag='"+item+"'>" + "" + "</div>").appendTo($target); 
			if(count!=undefined && tagtype != 'ftags')
				$("<div class='KTagPanel_tagitem_shortcut'>"+(count++)+"</div>").appendTo($tcont);

			var $dummy = $("<div class='KTagPatient ' draggable=true>" + item + "</div>").appendTo($tcont)
			if(tagtype!='ftags')
				$dummy.click(function(){that.modifyTag_internal(item)});
			$("<i class='fa fa-check' style='display:none'></i>").appendTo($tcont);
			return $tcont;
		}


		var count = 0;
		for(var k in xtaglist)
		{
			tagmap_[count] = k;
			var $tag = appendTag(k, count++);

			if( ctaglist[k] != undefined )
			{
				$tag.removeClass('KTagPanel_tagitem_disabled').find('i').show();
				delete ctaglist[k]
			}

			$tag.on("dragstart", dragstarter( function(x,name)
					{ 
						return function()
						{
							return {
								type: 'tagpaneltag',
								callback: dropCallback,
								obj:x,
								tag: x
							}
						}
					}(k), k) );
		}

		// render all other tags from current selection
		for(var k in ctaglist)
		{
			tagmap_[count] = k;
			var $tag = appendTag(k, count++)
			$tag.removeClass('KTagPanel_tagitem_disabled').find('i').show();
		}
		
		if(tagtype != 'ftags')
			tagmap = tagmap_

	}
	that.update = renderTagList;

	/******************************************************************************
	 handleDrop
	*******************************************************************************/
	function dropCallback(ev, params, ttt)
	{
		if(ttt && ttt.getCurrentViewer() && ttt.getCurrentViewer().currentFileID)
		{
			tobj = {tag:params.tag,objs:[]};
			tobj.objs.push(ttt.getCurrentViewer().currentFileID);
			var str = "tag_files";
			var $filerow = $('.fileRow[data-fileid="' + ttt.getCurrentViewer().currentFileID + '"]');

			/* allow to remove on drop? makes no sense
			var filetags = $filerow.find('.KTagFile');
			for(var k=0; k<filetags.length; k++)
			{
				if( filetags.eq(k).text() == params.tag)
					str = "tag_files_del";
			}
			*/
			var jsonString = JSON.stringify(tobj);
			ajaxRequest('command='+str+'&json=' + jsonString , function(e)
			{ 
				patientTableMirror.mirrorState(); 
				/*
				var $blinker = $("<div class='KReading_ItemBlinker'>tag added</div>").appendTo(document.body);
				$blinker.css('border-color', 'red');
				if(!$filerow.is(':visible'))
				{
					$filerow.show();
					var pp = $filerow.find('.imgTag').offset();
					$filerow.hide();
				}
				else
					var pp = $filerow.find('.imgTag').offset();
				//var pp = {top: ev.clientY, left:ev.clientX};
				$blinker.offset( $blinker.css({'top': pp.top , 'left': pp.left }) );
				$blinker.animate({width: 100, height: 100, opacity:0.2}, 500, function(){$blinker.remove()} )
				*/
				$.notify($filerow.attr('data-subfolder') +"/"+ $filerow.attr('data-filename') + " tagged with '" + tobj.tag + "'", "success");
			});			
		}
		tempObjectInfo = undefined;
	}


	/******************************************************************************
	 handleKeyEvent
	*******************************************************************************/
	that.modifyTag_internal = function(ttag)
	{
		var psid = patientTableMirror.getCurrentUniquePSID();
		if(!psid)
			return false

		var intent = currentrow_tags[ttag] == undefined ? "":"_del";
		var tempObjectInfo_temp = undefined
		if(state.viewer.selectionMode[1] == 's')
		{
			tempObjectInfo_temp = {type:"study",sid:psid.studies_id, piz:psid.patients_id }
		}
		else if(state.viewer.selectionMode[1] == 'p')
		{
			tempObjectInfo_temp = {type:"patient",piz:psid.patients_id }
		}
		if(tempObjectInfo_temp)
		{
			modifyTag(ttag,intent, undefined, [tempObjectInfo_temp])
			renderTagList();

// 			var $blinker = $("<div class='KReading_ItemBlinker'></div>").appendTo(document.body);
// 			var pp = tcols.stags.$tags.find("div[data-tag='"+ttag+"']").offset();
// 			$blinker.offset( $blinker.css({'top': pp.top , 'left': pp.left }) )
// 					.animate({width: 100, height: 100, opacity:0.2}, 500, function(){$blinker.remove()} )

			return true
		}
		return false

	}

	/******************************************************************************
	 handleKeyEvent
	*******************************************************************************/
	that.handleKeyEvent = function(evt)
	{
		var thecode = evt.keyCode;
		
		if( (thecode >= 48 && thecode <= 57) || (thecode>=96 && thecode <= 96+9)  || thecode == 192 ) // any number
		{
			if(thecode<95)
				var num = thecode - 48 ;
			else
				var num = thecode - 96 ;

			if(thecode == 192)
				num=0;
			if(evt.shiftKey || evt.ctrlKey || evt.getModifierState('CapsLock'))
				num+=10;
			

			if(tagmap[num] != undefined)
			{
				 return that.modifyTag_internal(tagmap[num])
			}

		}
		return false;
	}


	/******************************************************************************
	 finalize
	*******************************************************************************/
	//renderTagList();
	
	return that;
}	










/***************************************************************************************
* compare and subtract two different lists
****************************************************************************************/
function KExcelFunctions()
{
	var that = new Object();

	function TList()
	{
		var tt = {};
		tt.doublettes = undefined;
		tt.obj = {};
		return tt; 
	}

	var listA = new TList();
	var listB = new TList();
	var listBoth = new TList();
	var listAnotB = new TList();
	var listBnotA = new TList();
	
	var d;

	/*******************************************************************
	* main layout
	********************************************************************/
	if($('#KExcelFunctionsDialog').length == 0)
	{
		d = new dialog_generic();
		d.deleteonclose = false;
		d.$frame.attr('id', 'KExcelFunctionsDialog').show()
		d.$frame.width($(document.body).width()*.7);

	}
	else
	{
		$('#KExcelFunctionsDialog').show();
		return;
	}


    var $tablecontainer = $("<div class='KExcelList_tcontainer'></div>").appendTo(d.$container);

	create_table(listA, 'List A');
	create_table(listB, 'List B');
	//setcontent(listA, "1234 20120101\n1235 20120505");
	//setcontent( listB, "1234 20120101\n1232 20120505\n1232 20120508");

	create_table(listBoth,  'in Both',    1);
	create_table(listAnotB, 'A not in B', 1);
	create_table(listBnotA, 'B NOT in A', 1);

	compare_tables();

	/*******************************************************************
	* prepare table
	********************************************************************/
	function create_table(whichtable, title, type)
	{
		var $icontainer   = $("<div class='KExcelList_icontainer'></div>").appendTo($tablecontainer);
		var $title        = $("<div class='KExcelList_ititle'>"+title +"</div>").appendTo($icontainer);
		var $toolbar      = $("<div class='KExcelList_icontainer_toolbar' ></div>").appendTo($icontainer);
		
// 		if(type != undefined)
// 			$textarea.css('visibility', 'hidden')

		if(type == undefined)
		{
			var $textarea  = $("<textarea onclick='this.focus();this.select()'>paste content here</textarea>").appendTo($toolbar);
				$textarea.get(0).onpaste = function(ev){pastecontent(ev, whichtable)}
			whichtable.$textarea = $textarea;

			var $copybutton2  = $("<div class='modernbutton orange small' _style='height:15px;' >from patienttable</div>").appendTo($toolbar)
				.click(function(){paste_from_ptable(whichtable)});
			var $copybutton2  = $("<div class='modernbutton blue small' _style='height:15px;' >copy as psids</div>").appendTo($toolbar)
				.click(function(){copy_to_clipboard(whichtable, 'psid')});

		}
		else
		{
			var $copybutton2  = $("<div class='modernbutton red small' _style='height:15px;' >to patienttable</div>").appendTo($toolbar)
				.click(function(){copy_to_clipboard(whichtable, 'psid', 1)});
			var $copybutton2  = $("<div class='modernbutton yellow small' _style='height:15px;' >copy as excel</div>").appendTo($toolbar)
				.click(function(){copy_to_clipboard(whichtable, 'table')});
			var $copybutton2  = $("<div class='modernbutton blue small' _style='height:15px;' >copy as psids</div>").appendTo($toolbar)
				.click(function(){copy_to_clipboard(whichtable, 'psid')});
		}

		
	
		var $summary = $("<div class='KExcelList_summary'></div>").appendTo($icontainer);
		var $table = $("<table cellspacing=0  '></table>").appendTo($icontainer);

		whichtable.$container = $icontainer;
		whichtable.$summary = $summary;
		whichtable.$table = $table;
		return $icontainer;
	}

	/*******************************************************************
	* paste content /  convert a csv / string to table object
	********************************************************************/
	function paste_from_ptable(targettable)
	{
		var str = "";
		var selectedItems = patientTableMirror.selectedItems;
		for(var k=0; k<selectedItems.length; k++)
		{
			if(k>0)
				str += "\n";

			if(state.viewer.selectionMode[1]=='p')
			{
				str += selectedItems[k];
			}
			if(state.viewer.selectionMode[1]=='s')
			{
				var spl = selectedItems[k].split(riddelim);
				str += spl[0] + "\t" + spl[1].substring(1,9);
			}
		}
		setcontent(targettable, str);
		compare_tables();	
	}

	/*******************************************************************
	* paste from clipboard
	********************************************************************/
	function pastecontent(ev, whichtable)
	{
		setcontent(whichtable, (ev?ev.clipboardData.getData("Text"):"") || "" );
		compare_tables();
	}

	/*******************************************************************
	* paste content /  convert a csv / string to table object
	********************************************************************/
	function setcontent(whichtable, txt)
	{

		whichtable.obj = {};

		var rows = txt.split("\n");
		var trow, cells, uid, val, xx
		var obj = {};
		whichtable.doublettes = 0;
		for(var k=0; k<rows.length; k++)
		{
			trow = rows[k];
			if(trow.trim()=="")
				continue

			cells = trow.split(/[\t\s]+/);
			for(var c=0; c<cells.length; c++)
			{
				// convert dates?
				xx = cells[c].trim();
				if(xx.search(/\//) != -1 ) // USA date
				{
					xx = xx.split('/');
					if(xx.length==3)
						val = zeroPad(xx[2],2) + zeroPad(xx[0],2) + zeroPad(xx[1],2);
				}
				else if(xx.search(/\./) != -1 ) // german date
				{
					xx = xx.split('.');
					if(xx.length==3)
						val = zeroPad(xx[2],2) + zeroPad(xx[1],2) + zeroPad(xx[0],2);
				}
				else
				{
				  	val = xx;
				}
				cells[c] = val;
			}
			uid=cells.join('');	

			if(obj[uid] == undefined)
				obj[uid] = cells;
			else
				whichtable.doublettes++;
		}	
		
		whichtable.obj = obj;
		whichtable.$textarea.val("paste excel cells here");
		render_table_content(whichtable);
	}


	/*******************************************************************
	* render table
	********************************************************************/
	function render_table_content(whichtable)
	{
			var html ="";
			var count = 0;
			for(var k in whichtable.obj)
			{
				var trow = whichtable.obj[k];
				html += "<tr>";
				for(var c=0; c<trow.length; c++)
				{
					html += "<td>" + trow[c] + "</td>";
				}
				html += "</tr>";
				count++;
			}
			//html = "<div style='user-select:text;-webkit-user-select:all;'>" + html + "</div>" 
			//whichtable.$table.append($(html));
		
			whichtable.$table.empty().append($(html));
			
			var summary = "<b>" + count + "</b> unique rows";
			if (whichtable.doublettes != undefined)
				summary += ( "<br/><b>" + whichtable.doublettes + "</b> doublettes");
			whichtable.$summary.html(summary)
		
	}


	/*******************************************************************
	* compare 2 tables
	********************************************************************/
	function compare_tables()
	{
		var a = listA.obj;
		var b = listB.obj;
		listBoth.obj = {};
		listAnotB.obj = {};
		listBnotA.obj = {};
		for(var k in a)
		{
			if(b[k] != undefined)
				listBoth.obj[k] = a[k];
			else
				listAnotB.obj[k] = a[k];
			//a[k].found = 
		}
		for(var k in b)
		{
			if(a[k] == undefined)
				listBnotA.obj[k] = b[k];
			//b[k].found = (a[k] != undefined)
		}
		render_table_content(listBoth)
		render_table_content(listAnotB)
		render_table_content(listBnotA)
	}


	/*******************************************************************
	* copy to clipboard
	********************************************************************/
	function copy_to_clipboard(ttable, mode, maptoptable)
	{
		var str = "";
		for(var k in ttable.obj)
		{
			var trow = ttable.obj[k];
			if(mode == 'psid')
			{
					str += trow[0] + "#" + trow[1]; ; 
			}
			else
			{
				for(var c=0; c<trow.length; c++)
				{
					str += (c>0?"\t":"") + trow[c]; 
				}
			}

			str += maptoptable?" ":"\n";
		}

		if(maptoptable)
		{
			$(".KSearchFields[name='PIZ']").val(str);
			if (state.viewer.levelMode)
				patientTableMirror.levelMode_backToAll();
			patientSearch({keyCode:13},function() { });

		}
		else
		{
			var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+str+"</textarea>").appendTo($body).select();
			var successful = document.execCommand('Copy');
			$.notify(" Copied to clipboard","success");
			$temp.remove();
		}
		
	}





	return that;
}

function setNORAenv(toadd)
{
    var p = {}
    p.application = "webview"
    p.electron = false;
    p.debug = false;

    p.url_pref = ""

    p.setPatientTableWidth = function() {}
    p.setPatientTableLayout = function() {}
    p.jsonTable_loadFormattedList = function() {}
    p.unsavedChanges = function() {return false; }

    p.KViewer = undefined;
    p.commandDialog = undefined;
    p.tempObjectInfo = undefined;
    p.hasProxy = false;
    p.static_info = {};
    p.standardToolsize = 300;
    p.userinfo = {username:""};
    p.guestuser="";
    p.storage = undefined;
    p.ViewerSettings = undefined;
    p.TableHidden = true;
    p.markerProxy = undefined;
    p.defaultOpenPath ;
    p.markerProxy = undefined;
    p.pakoWorker = true;

    p.$body = $(document.body);

    p.signalhandler = new SignalHandler();
    p.colormap = new KColormap();
    p.presetManager	   	 = new PresetManager();
    p.stateManager	   = new StateManager();
    p.logProcess = console.log;


    for (var k in p)
    {
        if (window[k] == undefined)
            window[k] = p[k];
    }
    for (var k in toadd)
    {
         window[k] = toadd[k]
    }

}