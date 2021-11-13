
/** A proxy for the tools, tools are just loaded on demand  
 * @class */
function ToolProxy(toolvar, toolObj, toolname)
{
    var id;
    var statetoset;

    if(!hasProxy)
    {
        id = ktoolslist.length;
        return buildTool(id);
    }

    function buildTool()
    {
        if (typeof toolObj == "string")
            toolObj = eval(toolObj);

        var tool = new toolObj(KViewer,toolname);
        KViewer[toolvar] = tool;
        ktoolslist[id] = tool;
        tool.ktoolsindex = id;
        if (hasProxy)
            KToolWindow.attachToollist(tool);
        tool.resize(standardToolsize);
        tool.setState(statetoset);
        return tool
    }

    var handler = {       
        get: function(target, name,rec) {
            if (name == 'isproxy')
                return true
            else if (name == 'notyetloaded')
            {
                var tobj = toolObj
                if (typeof tobj == "string")
                    tobj = eval(tobj);

                return tobj.notyetloaded != undefined
            }
            else if (name == 'setState')
            {
                return function(x) {
                     statetoset = x; 
                }
            }
            else if (name == 'name')
                return toolname;
            else if (name == 'isinstance' || name == "enabled")
            {
                if (KViewer[toolvar].isproxy)
                    return false;
                else
                    return KViewer[toolvar][name];
            }
            else
            {
                console.log(toolvar + ' started by ' + name);
                var tool = buildTool();
                return tool[name];
            }

        }
    };
    var proxy = new Proxy({},handler);
    id = ktoolslist.length;
    ktoolslist.push(proxy);

    return proxy;
}


function attachNameDivHandler(fobj, $captiondiv, cb)
{
    if (fobj.namedivs == undefined)
        fobj.namedivs = [];

    $captiondiv.on('mousedown', function() {
        $captiondiv.attr('contenteditable', true);
    });
    $captiondiv.on('blur', function() {
        $captiondiv.attr('contenteditable', false);
         $captiondiv.text(fobj.filename);
    });

    
    fobj.namedivs.push($captiondiv);
    $captiondiv.keydown(function(ev) {
        if (ev.keyCode == 13) {
            $(ev.target).blur();
            return false
        }
    })
    .keyup(function(ev)
    {
        var subf_given = false
        var txt = $captiondiv.text().trim();
        txt = txt.split("/");
        var name = txt[txt.length-1];
        var subf = ""
        if (txt.length > 1)
        {
            subf_given = true
            txt.pop();
            subf = txt.join("/");            
        }

        fobj.filename = name;
        if (fobj.fileinfo == undefined)
            fobj.fileinfo = {}
        if (subf != "" | subf_given)
            fobj.fileinfo.SubFolder = subf;

        if (fobj.namedivs != undefined)
            for (var i = 0; i < fobj.namedivs.length; i++)
            {
                if ($captiondiv != fobj.namedivs[i])
                    fobj.namedivs[i].text(fobj.filename);
            }
        cb();

    });


}



// ======================================================================================
// ============= frame for undocked tool
// ======================================================================================
function resizeTriangle(afterResize,onresize,$frame_)
{
    var $resizer = $("<div class='dialog_generic_resizeTriangle'></div>")
    .mousedown(function()
    {
        if ($frame_ != undefined)
            $frame = $frame_
        else
            $frame = $resizer.parent();
        $resizer.addClass('dialog_generic_resizeTriangle_hovered');
        $(document.body).on('mousemove', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var newwidth = ev.clientX - $frame.offset().left + window.pageXOffset+10;
            var newheight = ev.clientY - $frame.offset().top + window.pageYOffset+10;
            if (newwidth < 200 | newheight < 200)
            {
                return;
            }
            $frame.width(newwidth);
            $frame.height(newheight);
            if (onresize)
                onresize(newheight)

        });
        $(document.body).on('mouseup', function() {
            $resizer.removeClass('dialog_generic_resizeTriangle_hovered');
            $(document.body).off('mousemove mouseup');
            if (afterResize)
                afterResize();
        });

    });
    return $resizer;
}

// ======================================================================================
// ======================================================================================
// ============= the generic toolwindow
// ======================================================================================
// ======================================================================================


var ktoolslist = [];

function KToolWindow(master, $toggle)
{
    /** The generic tool window functionality
   * @class 
   * @alias KToolWindow
   */
    var that = new Object();
    that.name = 'generic';

    // stuff for viewport attachment
    that.viewerType = 'Manager';
	/** if tool is whithin a viewport this is the parent viewport */
    that.viewport = undefined;
	/** this is a true instance and not just a proxy {@link ToolProxy} */
    that.isinstance = true;
    var saved_height;


    that.$toggle = $toggle.click(function(ev) {
        that.toggle();
    });

    that.update = function() {}
    that.setState = function () {}
    that.getState = function () {}

    that.enabled = false;
    that.master = master;


    var $container = $("<div class='annotation_tool'></div>");
    that.$container = $container;

    that.onresize = function(ev)
    {
        if (that.tstate.target != -2)
            return;

        // var maxdelta = $("#frame").height()  - $("#patientTableLowerContainer").height() - 100;

        var th = that;

        var s = ev.clientY;
        var h = th.$container.height();

        var th_lower = KToolWindow.findToolbyContainer(th.$container.next());
        var th_upper = KToolWindow.findToolbyContainer(th.$container.prev());
        var h_upper;
        if (th_upper != undefined)
            h_upper = th_upper.$container.height();

        $(document.body).on("mousemove", function(ev)
        {
            //if (s-ev.clientY < maxdelta & 
            if (h + s - ev.clientY > 50)
            {
                if (th_lower != undefined | userinfo.username != guestuser)
                   th.resize(h + s - ev.clientY);
                if (th_upper != undefined)
                    th_upper.resize(h_upper - s + ev.clientY);
                setPatientTableLayout();
            }
        });
        $(document.body).on("mouseup", function()
        {
            $(document.body).off("mousemove mouseup");
            saveSizesPt();
        });
    }
    ;



    /** the spinner $div */
    that.$spinner = $("<div class='KViewPort_spinner' ><i class='fa fa-spinner fa-spin'></i> <span >Loading</span></div>").appendTo($container);
    /** spinner callback for this tool (see {@link module:MiscFunctions~theSpinner}) */
    that.progressSpinner = theSpinner(that.$spinner);
    that.hideSpinner = function() {  that.$spinner.hide(); }


    var $resizer = $("<div class='annotion_tool_resizer'><div><div></div></div></div>").appendTo($container).on("mousedown", that.onresize);

    var $topDiv = $("<div>").appendTo($container);

    var $newdragger = $("<div class='KToolsdragger' draggable=true><i class='fa fa-hand-paper-o' > </i></div>").appendTo($topDiv);
    $newdragger[0].ondragstart = function(e)
    {
        if (that.name == "Workspace" && userinfo.username == guestuser && guestuser != "")
            return;
        dragstart(e);
        setTimeout(function() {
            that.$topRow.removeClass("highlight");cleanAllDropIndicators();
        },3000);  
    } 

    var $topRow = $("<ul class='KToolsTopMenu menu_generic small'></ul>").appendTo($topDiv);
    that.$topRow = $topRow;
    $topRow.append($("<li  style='float:right'> <a><i class='fa fa-close close_button' ></i></a></li>").appendTooltip("closetool").click(function() {
        that.toggle(false);
    }));
    

    that.$leftToolistDiv =$("<div class='KTool_leftdiv'></div>").appendTo($container); 

    
    that.$leftToolistDiv.on("mouseenter",function() {
        that.$leftToolistDiv.addClass('LDvisible');
    })

    that.$leftToolistDiv.on("mouseleave",function() {
       that.$leftToolistDiv.removeClass('LDvisible');
    })


    function dragstart(ev)
    {
        // undock indicator
        setTimeout(function(e){
            var $undocker = $("<div class='dropindicator_general_vert body_dropindicator' style=''></div>").hide().appendTo($(document.body)).fadeIn(150);
            setPixelPosition($undocker, [1,1, 400,100], 0);
            var $inner = $("<div style='padding:9px; background:rgba(20, 139, 0, 0.9)'>Drop here to undock tool</div>").appendTo($undocker);
                    $inner.on("dragenter dragover", function(ev)
                    { $(this).css('background', 'rgba(20, 139, 0, 0.9)'); 				ev.preventDefault();ev.stopPropagation();return false; });
                    $inner.on("dragleave", function(ev)
                    { $(this).css('background', 'rgba(20, 139, 0, 0.9)');				ev.preventDefault();ev.stopPropagation();return false; });
                    $inner[0].ondrop = function(ev)
                    { 
                        $undocker.remove();
                        cleanAllDropIndicators(); 
                        that.show(-1);
                        that.$container.offset({left:60, top:60});
                        that.$container.animate({left: tstate.udsize[0], top: tstate.udsize[1]}, 100);
                        KToolWindow.dragTool = undefined;				
                        ev.preventDefault();ev.stopPropagation();return false; 
                    }
        },250);
        patientTableScrollLock($("#patientTableWrap"));
        KToolWindow.dragTool = that;
        tempObjectInfo = undefined;
        ev.toolDragDrop = "Tool:" + that.name;
        buildDragImg(ev);
        ev.stopPropagation();
    }


    var defaulttarget = (KViewer.standalone?-1:-2);
    var tstate =
    {
        udsize: [400, 400, 600, 600],
        // undocked size
        ptsize: ['100%', 300],
        // size in patientable
        target: defaulttarget,
        lasttarget: defaulttarget
       
    }
    that.tstate = tstate;

    var $resizeTriangle = resizeTriangle(saveSizesUndocked,function(x) { that.resize(x); } ).hide().appendTo($container);


    /***************************************************************************************
	* toggle docked state
	****************************************************************************************/

    function toggledockedstate(forcewhichstate)
    {
        if (forcewhichstate != undefined)
        {
            if (forcewhichstate)
                // force docked state
                that.show(that.tstate.lasttarget);
        }
        else // toggle
        {
            if (that.tstate.target == -1) // was undocked, so dock into lasttarget
            {
                that.show(that.tstate.lasttarget);
            }
            else // was docked, so undock
            {
                that.$container.detach();
              
                that.show(-1);
            }
        }
         
    }
    that.toggledockedstate = toggledockedstate;

    function saveSizesUndocked()
    {
        tstate.udsize[0] = $container.offset().left;
        tstate.udsize[1] = $container.offset().top;
        tstate.udsize[2] = $container.width();
        tstate.udsize[3] = $container.height();
        //that.$container.children().eq(4).height('100%')   
    }

    function saveSizesPt()
    {
        that.tstate.ptsize[1] = $container.height();
        that.tstate.ptsize[0] = 1;
    }

    function setdocked()
    {
        //saveSizesUndocked(); don't! otherwise will be set to zero in some cases
        $topRow.off('mousedown');
        $container.css('position', 'static');
        $resizeTriangle.hide();
    }

    function setundocked()
    {
        that.tstate.lastttarget = that.tstate.target;
        $topRow.off('mousedown');
        $resizer.hide();
        $container.css('position', 'absolute')
        if (!$container.hasClass("movableWindows"))
            $container.addClass("movableWindows");
        
//         var zindex = $container.css('z-index');
//         if (zindex == 0)
//         {
//             var x = getHighestZIndexOfSameClass(("movableWindows"));
//             $container.css('z-index', (parseInt(x.index) + 1).toString());
//         }
        
        bringToFront($container);

        $container.offset({
            left: that.tstate.udsize[0],
            top: that.tstate.udsize[1]
        }).width(that.tstate.udsize[2]).height(that.tstate.udsize[3]);
        //setPatientTableLayout();
        $topRow.mousedown(function(ev) {
            movableWindowMousedownFn(ev, $container, saveSizesUndocked, 'fa')
        });
        $resizeTriangle.show();
    }



    var $toolselector = $("<ul ></ul>");
    that.$toolselector = $toolselector;
  
  //  that.$topRow.append($("<li> <a> <i class='fa fa-bars fa-1x'></i></a></li> ").append($toolselector));

    that.customToggle = function() {
        return false;
    }
    

    // overwrite this for your custom toggle function
    that.toggle = function(forcestate)
    {
        if (forcestate != undefined)
            that.enabled = forcestate;
        else
        {

            if (that.tstate.target >= 0 && that.enabled)
            {
                if (!KViewer.viewports[that.tstate.target].visible)
                {
                   KViewer.viewports[that.tstate.target].setCurrentViewer();
                   that.tstate.target = -1;
                }
                else
                    that.enabled = false
            }
            else
                that.enabled = !that.enabled;


        }

        if (that.enabled)
        {
            that.$toggle.addClass('KView_tool_enabled');
            that.show();
        }
        else
        {
            that.$toggle.removeClass('KView_tool_enabled');
            that.hide();
        }

        that.customToggle(that.enabled );
    }


    /** insert this tool into some target (patientTable, viewport, or undockeded stat)
        replace another tool, if target is occupied
     *  @function 
     *  @param {object} target -
	 *   <pre>
	 *	  0...9 viewport  
	 *	  -1	undocked  
	 *	  -2	patientTable (inser new)
	 *	  $div  patientTable (before anther tool)
	 *	  tool  another tool (identify by pointer), in this case, replace the tool
     *
	 *	  undefined: restore state, find last target (save as -2, -1, 0 ... ), if in vp, must check for another existing tool
	 *   </pre>
	 */  				
    that.show = function(target)
    {

        // no target specified, try to restore from remembered state
        if (target == undefined)
            target = that.tstate.target;

        // translate vp to vpID
        if (target.viewPortID != undefined)
            target = target.viewPortID;

        // ******************* check where this item was last
        if (that.tstate.target >= 0 && that.enabled != 0)
            KViewer.viewports[that.tstate.target].setCurrentViewer();
        else if (that.tstate.target == -2)
        {
        //saveSizesPt(); //don't do this! otherwise will be overwritten on reload
        }


        //***********************  undock ******************************
        if ($.isNumeric(target) && target == -1)
        {
            $(document.body).append($container);
            setundocked();
        }

        //***********************  ptable at end ******************************
        else if ($.isNumeric(target) && target == -2)
        {
            setdocked();
            var childs = $("#patientTableLowerContainer").children();

            var above;
            if (userinfo.username == guestuser)
                above = childs[childs.length - 1];
            else
                above = childs[0];

            that.$container.insertAfter(above)

            if (that.$container.position().top+that.$container.height() > $("#frame").height()+80)
            {
                var toolabove = KToolWindow.findToolbyContainer($(above));
                var newheight = ($("#frame").height()+80 - $(above).position().top)*0.5;
                toolabove.resize(newheight)
                that.resize(newheight);
            }
            

            if (KViewer.zoomedViewport != -1)
                KViewer.setSizeLeftViewportCol();

        }

        //*******************  ptable after another tool ***********************
        else if (target.append != undefined && target.hasClass('annotation_tool'))
        {
            setdocked();
            that.$container.insertBefore(target);
            target = -2;

            if (KViewer.zoomedViewport != -1)
                KViewer.setSizeLeftViewportCol();

        }

        //***********************  viewport ******************************
        else if ($.isNumeric(target) && target >= 0)
        {
            var vp = KViewer.viewports[target]
            // check if vp is occupied by another tool. If yes, show as undocked
            // this normally does not happen
            if (vp.$container.find('.annotation_tool').length > 0)
            {
                that.show(-1);
                return;
            }
            setdocked();

            vp.hideDropIndicators();
            var currview = vp.getCurrentViewer();
            if (currview != undefined && currview.close != undefined)
                vp.getCurrentViewer().close();
            vp.setCurrentViewer(that);
        }

        // only if we come from an undocked state, save last state
        if (that.tstate.target !== -1)
        {
            that.tstate.lasttarget = that.tstate.target;
        }

        // final checks and specialities
        if (target == -2)
        {
            $resizer.show();
            that.resize(that.tstate.ptsize[1]);
        }
        else    if (target == -1)
        {
            that.resize(that.tstate.ptsize[1]);
        }
        else
        {
            $resizer.hide();
        }

        that.tstate.target = target;
        that.enabled = true;
        that.setInnerLayout();

        if (that.update)
            that.update();
        setPatientTableLayout();

    }


    /** close(hide) the tool (but remember state),
    * @function */
    that.hide = function(target)
    {
        that.enabled = 0;
        that.$container.detach();
        if (that.tstate.target >= 0)
        {
            KViewer.viewports[that.tstate.target].setCurrentViewer();
        }
        else if (that.tstate.target == -2)
        {
            if (KViewer.zoomedViewport != -1)
                KViewer.setSizeLeftViewportCol();
            
            setPatientTableLayout();
        }

    }



    new Dragster(that.$container.get(0));
    that.$container.get(0).addEventListener('dragenter', function(ev)
    {
        if (KToolWindow.dragTool != undefined)
        {
            that.$topRow.addClass("highlight");
        }
    });

    that.$container.get(0).addEventListener('dragster:leave', function(ev)
    {
        if (KToolWindow.dragTool != undefined)
        {
            that.$topRow.removeClass("highlight");
        }
    });

    that.$container.on("drop", function(ev)
    {
        that.$topRow.removeClass("highlight");
        if (that.name == 'Files' & userinfo.username == guestuser)
        {
            dropOnLeftBar();
        }
        else if (KToolWindow.dragTool != undefined)
        {

            var source = KToolWindow.dragTool;
            if (that == source) // drop on itself
            {
                KToolWindow.dragTool = undefined;
            }
            else if (that.tstate.target == -2) // drop into the ptable: insert new one before
            {
                KToolWindow.dragTool.show(that.$container);
            }
            else if (that.tstate.target >= -1) // undocked or viewport: full replacement
            {
                that.hide();
                KToolWindow.dragTool.show(that.tstate.target);
            }

            KToolWindow.dragTool = undefined;

            ev.stopPropagation();
            ev.preventDefault();

            return;
        }
        else if (ev.dataTransfer && ev.dataTransfer.types && ev.dataTransfer.types[0] == 'text/plain')
        {
            // prevent all text drop on tools 
            ev.stopPropagation();
            ev.preventDefault();
        }
	  		
	

        cleanAllDropIndicators();

    });



    that.detachContent = function()
    {
        $container.detach()
    }
    ;

    that.setInnerLayout = function()
    {
        if (that.tstate.target >= 0) // in a viewport
        {
            var vp = KViewer.viewports[that.tstate.target];
            that.$container.width(vp.$container.width() - 0);
            that.$container.height(vp.$container.height() - 0);
        }
        else if (that.tstate.target == -1) // undocked
        {


        }
        else if (that.tstate.target == -2) // patientTable
        {
            that.$container.css("width", "100%");
        }
    }
    ;


    that.tablestate = undefined;
    that.attachTableOperator = function($to, dummy, sortable) {
        that.tablestate = attachTableOperator($to, that.tablestate, sortable).state;
    }


    function dropOnLeftBar()
    {
        if (KToolWindow.dragTool != undefined)
        {
            KToolWindow.dragTool.hide();
            KToolWindow.dragTool.show();
            KToolWindow.dragTool = undefined;
            return;
        }
    }


    return that;
}

/** @param {div} $cont - the container div of the tool */
KToolWindow.findToolbyContainer = function($cont)
{
    for (var k = 0; k < ktoolslist.length; k++)
    {
        if (ktoolslist[k].isinstance && ktoolslist[k].$container != undefined && ktoolslist[k].$container[0] == $cont[0])
            return ktoolslist[k];
    }
    return undefined;
}


/** @param {div} $cont - the container div of the tool */
KToolWindow.findToolInLowerContainer = function()
{
    var incontainer = [];
    var tools = $("#patientTableLowerContainer").children();
    for (var k = 0; k < tools.length; k++)
    {
        var t = KToolWindow.findToolbyContainer($(tools[k]))
        if (t != undefined)
            incontainer.push(t);
    }
    return incontainer;
}



/** attach this tool to the list of the "wrench" button of Kview for tool selection
 * $param {div} $container - the KView container
 * @function */
KToolWindow.attachToolSelectors = function($container)
{
    KToolWindow.$thetoggle = $("<div class='KView_tool '><i class='fa fa-wrench fa-1x'></i></div>");
    KToolWindow.$thetoggle.insertAfter($container.children()[7]);
    var $menu = $("<ul class='KView_tool_menu'></ul>").appendTo(KToolWindow.$thetoggle);
    $menu.append($("<li>Toolboxes ...</li>"));

    for (var k = (userinfo.username == guestuser && !KViewer.standalone) ? 1 : 0; k < ktoolslist.length; k++)
    {
        if (!hasProxy)
            KToolWindow.attachToollist(ktoolslist[k]);

        var $tdiv = $("<li draggable='true'>" + ktoolslist[k].name + "</li>").appendTo($menu);
        $tdiv.click(function(_k) {
            return function() {
                ktoolslist[_k].$toggle.trigger('click')
            }
        }(k))
        $tdiv[0].ondragstart = function(_k) {
            return function(ev)
            {

                ev.toolDragDrop = "Tool:" + ktoolslist[_k].name;
                buildDragImg(ev);
                KToolWindow.dragTool = ktoolslist[_k];
                //patientTableScrollLock();

            }
        }(k);
        $tdiv.on("dragover", function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            return false;
        })
        
    }

}

/** attach [that] to the list inside the tool for other tool selection 
 * @param {object} that - the tool to which the selectoe to be attached */
KToolWindow.attachToollist = function(that)
{
    for (var k = 0; k < ktoolslist.length; k++)
//    for (var k = (userinfo.username == guestuser  && !KViewer.standalone) ? 1 : 0; k < ktoolslist.length; k++)
    {
        var onclick = function(k) {
            return function()
            {
                //console.log("changing tool");
                if (ktoolslist[k] === that) // self
                {
                    return false
                }
                if (that.tstate.target == -1)
                {
                    ktoolslist[k].show(-1);
                    ktoolslist[k].$container.offset({
                        left: that.tstate.udsize[0],
                        top: that.tstate.udsize[1]
                    }).width(that.tstate.udsize[2]).height(that.tstate.udsize[3]);
                    that.hide();
                }
                else if (that.tstate.target == -2)
                {
                    ktoolslist[k].show(-2);
                    ktoolslist[k].$container.height(that.$container.height());
                    var $anchor = that.$container.before();
                    if ($anchor.length == 0)
                        // no prev element, append to parent
                        ktoolslist[k].$container.appendTo($container.parent())
                    else
                        ktoolslist[k].$container.insertAfter($anchor);
                    //that.$container.replaceWith(ktoolslist[k].$container);	          // replaceWith will loose handlers
                    that.$container.detach();
                    that.hide();
                }
                else if (that.tstate.target >= 0)
                {
                    that.hide();
                    ktoolslist[k].show(that.tstate.target);
                }
            }
        }(k)


        $("<li><a>" + ktoolslist[k].name + "</a></li>").click(onclick).appendTo(that.$toolselector);

        var toolicons = KToolWindow.toolicons ;
        var thei = "";
        if (toolicons[ktoolslist[k].name])
            thei = "<i class='fa " + toolicons[ktoolslist[k].name] + "'></i>";
        var enabled = "";
        if (ktoolslist[k] === that)
            enabled ="KView_tool_enabled";
        $("<div class='KView_tool " + enabled + " KView_tool_small'>" + thei +" <ul class='KView_tool_menu'> <li> "+ktoolslist[k].name+" </li> </ul></div>").click(onclick).appendTo(that.$leftToolistDiv);
    }
}


KToolWindow.toolicons = {
                Workspace:'fa-navicon',
                ROIs:'fa-pencil',
                "Objects 3D":"fa-cube",
                Atlas:"fa-map",
                Forms:"fa-file-text-o",
                "MarkerTool":"fa-comment-o",
                "Navigation":"fa-arrows",
                "CurveTool":"fa-area-chart",
                "ReadingTool":"fa-registered"

}



KToolWindow.getToolsState = function()
{
    var toolstate = [];
    for (var k = 0; k < ktoolslist.length; k++)
    {
        var tool = ktoolslist[k];
        if (tool.enabled)
        {
            var thestate = {
                tool: tool.name,
                table: tool.tablestate,
                tstate: tool.tstate,
                setting: tool.getState()
            };
            toolstate.push(thestate);
        }

    }
    return toolstate;

}


KToolWindow.closeAll = function()
{
    // set the enabled tools
    for (var k = (userinfo.username != guestuser || electron) ? 0 : 1; k < ktoolslist.length; k++)
    {
        if (ktoolslist[k].isinstance)
        {
            ktoolslist[k].hide();
        }
    }
}

KToolWindow.reestablishToolState = function(toolstate)
{

    KToolWindow.closeAll();

    // set the enabled tools
    for (var k = 0; k < toolstate.length; k++)
    {
        for (var j = (userinfo.username != guestuser || electron) ? 0 : 1; j < ktoolslist.length; j++)
        {
            var tool = undefined;
            if (ktoolslist[j].name == toolstate[k].tool)
                break;
        }
        if (ktoolslist[j] != undefined)
        {
            var toggleTool = function(j,k)            
            {
                if (ktoolslist[j].notyetloaded)
                {
                    setTimeout(function() { toggleTool(j,k) },25);
                }
                else
                {
                    ktoolslist[j].toggle(false);

                    //extend is important!
                    $.extend(true, ktoolslist[j].tstate, toolstate[k].tstate);
                    ktoolslist[j].tablestate = toolstate[k].table;
                    ktoolslist[j].setState(toolstate[k].setting);

                    ktoolslist[j].show();
                    ktoolslist[j].update();
                }
            }
            toggleTool(j,k);
           
        }
    }
}



function KTool_enabled()
{
    for (var k = 0; k < ktoolslist.length; k++)
    {
        if (ktoolslist[k].enabled)
            return k;
    }
    return -1;
}
