



// ======================================================================================
// ======================================================================================
// ============= KRoiTool
// ======================================================================================
// ======================================================================================


function KRoiTool(master)
{
    var $menu = $("<ul class='KView_tool_menu'></ul>").append($("<li>ROI Tool</li>"));
    var $thetog = $("<div class='KView_tool '><i class='fa fa-pencil fa-1x'></i></div>").append($menu);

    /** A ROI-tool for drawing and managing ROIs
	 * @class
	 * @alias KRoiTool
	 * @augments KToolWindow
	 */
    var that = new KToolWindow(master,$thetog);

    that.name = 'ROIs';

    that.conncompdesc = "island";

    var ROIs = {};
    that.ROIs = ROIs;

    var currentROI = undefined;

    that.$topRow.addClass("RoiTool_topmenu")

    /***************************************************************************************
    * the roi menu
    ****************************************************************************************/
    var $mainmenu = $("<ul></ul>");
    var $menu = $("<ul ></ul>");
    //$menu.append($("<li><a>New ROI</a> </i></li>").click(addROI));

    $menu.append($("<li><a>Save all ROIs </a></i></li>").click(function()
    {
        saveAllROIs();
    }));
    $menu.append($("<li><a>Delete all ROIs</a></i></li>").click(function()
    {
        clearAll();
    }));

    that.$topRow.append($("<li><a>ROI menu</a></li>").append($menu).appendTo($mainmenu));
    that.$topRow.append($mainmenu);

    that.$topRow.append($("<li style='margin-left:5px; padding-left:5px; border-left:1px solid gray'><a>  ROI stats</a> </i></li>").click(function()
    {
        that.statdlg.toggle();
        that.statdlg.dostats();
    }
    ));

    that.statdlg = new statistics_dialog();

    that.computeStats = computeStats;

        function computeStats(roi, img, opts)
        {
            var w = roi.sizes[0];
            var wh = roi.sizes[0] * roi.sizes[1];
            var whd = roi.sizes[0] * roi.sizes[1] * roi.sizes[2];

            var np = 0;
            if (img)
            {
                var A = math.multiply(math.inv(img.edges), roi.edges);
                np = img.numTimePoints
            }

            var mean = [];
            var std = [];
            var vol = [];
            var vol_tot = [];            
            var area = [];
            var area_tot = [];

            // set calcmedian as flag, might be expensive on huge arrays to store all vals
            var calcmedian = true;
            var median = [];
            var iqr1    = [];
            var iqr2    = [];
            var values = [];

			var exclude_zeros = (opts && opts.exclude_zeros);

            // iterate over timeseries if present
            for (var t = 0; t < math.max([np, roi.numTimePoints]); t++)
            {
                var m = 0;
                var m2 = 0;
                var cnt = 0;
                var cnt2 = 0;
                var tvals = [];

                var currentTimePointROI =  t>roi.numTimePoints-1?roi.numTimePoints-1:t
                var currentTimePointIMG =  t>np-1?np-1:t
                
                for (var z = 0; z < roi.sizes[2]; z++)
                    for (var y = 0; y < roi.sizes[1]; y++)
                        for (var x = 0; x < roi.sizes[0]; x++)
                        {

                            if (roi.data[x + y * w + z * wh + currentTimePointROI*whd] > 0)
                            {
                                var tp = 0;
                                var v = 0;
                                if (img)
                                {
                                    var toffs = img.sizes[0] * img.sizes[1] * img.sizes[2] * currentTimePointIMG;
                                    v = NNInterp(img, x, y, z, A._data, toffs);
                                    v = img.datascaling.e(v);
                                }
                                if (!isNaN(v))
                                {
                                	if( !(v==0 && exclude_zeros) )
                                	{
										m += v;
										m2 += v * v;
										cnt++;
										if(calcmedian)
											tvals.push(v);
                                	}
                                }
                                cnt2++;
                            }
                        }

                mean.push( m / cnt );
                //console.log(m + " count " + cnt)
                std.push( math.sqrt( m2 / cnt - mean[t] * mean[t]) )

                if(calcmedian)
                {
                	var xx = math.median(tvals, 1) ;
                	if (xx.median == undefined)
                	{
                	   xx.median = NaN;
                	   xx.iqr1 = NaN;
                	   xx.iqr2 = NaN;
                	}
                    median.push( xx.median);
                    iqr1.push( xx.iqr1 );
                    iqr2.push( xx.iqr2 );
                    values.push(tvals);
                }

                var tvol  = cnt * roi.voxSize[0] * roi.voxSize[1] * roi.voxSize[2] / 1000; // mL
                var tvol_tot  = cnt2 * roi.voxSize[0] * roi.voxSize[1] * roi.voxSize[2] / 1000; // mL
                // mL or microliters ??
    //             if( tvol < 1)
    //                 var volumestr = (tvol *1000).toFixed(1) + " microL";
    //             else
    //                 var volumestr = tvol.toFixed(1) + " mL";
                // for 1-D rois ,allow also a area
                vol.push(tvol);
                vol_tot.push(tvol_tot);

                var tarea = cnt * roi.voxSize[0] * roi.voxSize[1] / 100;// in cm2
                var tarea_tot = cnt2 * roi.voxSize[0] * roi.voxSize[1] / 100;// in cm2

                area.push(tarea);
                area_tot.push(tarea_tot);
            }

            return {
                mean: mean,
                std: std,
                vol:vol,
                vol_tot:vol_tot,
                area:area,
                area_tot:area_tot,
                median:median,
                iqr1: iqr1,
                iqr2: iqr2,

            };
        }



    /***************************************************************************************
   * statistics dialog
   ****************************************************************************************/

    function statistics_dialog()
    {
        var that = new dialog_generic();
        that.$frame.hide()
        $("<li><a>ROI statistics</a></li>").appendTo(that.$menu)
        $("<li><a> <i class='fa fa-refresh'></i> </a>  </li>").click(dostats).appendTo(that.$menu);
        $("<li><a> <i class='fa fa-copy'></i>copy table to clipboard </a>  </li>").click(function() { copyTableToClipboard($table.get(0)); } ).appendTo(that.$menu);

		var $options = $("<table class=''></table>").appendTo(that.$container);
		//var $threshold = $("<input value='-Inf' type='number'/>").appendTo($("<div><span> take values greater than: </span></div>").appendTo($options));
		var $exclude_zeros = $("<input id='dsgssgafsgafgaeeae' type='checkbox'/>").appendTo($("<div><label for='dsgssgafsgafgaeeae'>exclude zeros: </label></div>").appendTo($options));


        //that.$container.append($("<div id='roistatsdialog'></div>"));


        /***************************************************************************************
        * statistics table
        ****************************************************************************************/
        var $table;

        function dostats()
        {
            var _imgs = {};
            for (var k = 0; k < KViewer.viewports.length; k++)
                if (KViewer.viewports[k] && KViewer.viewports[k].medViewer != undefined && KViewer.viewports[k].medViewer.nii != undefined)
                {
                    var v = KViewer.viewports[k].getCurrentViewer();
                    _imgs[v.currentFileID] = KViewer.viewports[k].getCurrentViewer();

                }

            var rois = Object.keys(ROIs);
            var imgs = Object.keys(_imgs);


            that.$container.find(".KRoistats_tablecontainer").remove();

            var $div = $("<div class='KRoistats_tablecontainer'></div>").appendTo(that.$container);


            $table = $("<table class='KRoistats_table text_selectable'></table>").appendTo($div);

            //var $row = $("<tr> <td>Image</td> <td>T</td> <td>ROI</td>  <td></td> <td>mean</td>  <td>std</td>  <td>vol (mL)</td>  <td>area (cm2)</td>  </tr>").appendTo( $("<thead></thead>").appendTo($table ));

            var $row = $("<tr> <td>Image</td> <td>T</td> <td>ROI</td> <td>T</td> <td></td> <td>median</td> <td>iqr1</td> <td>iqr2</td> <td>mean</td>  <td>std</td>  <td>vol (mL)</td>  <td>area (cm2)</td>  </tr>").appendTo( $("<thead></thead>").appendTo($table ));

            var $tbody = $("<tbody></tbody>").appendTo($table);

            for (var j = 0; j < imgs.length; j++)
            {

                var x= _imgs[imgs[j]];
                var img = _imgs[imgs[j]].niiOriginal;

                for (var k = 0; k < rois.length; k++)
                {
                    var roi = ROIs[rois[k]];


                    var stats = computeStats(roi.content, img, {exclude_zeros: $exclude_zeros.is(':checked') });

                    // iterate over timepoints
                    for(var t=0; t<stats.mean.length; t++)
                    {

                        var $trow = $("<tr></tr>").appendTo($tbody);
                        if(k==0)
                        {
                            var filename =  x.currentFileinfo.SubFolder + x.currentFilename  ;
                            var tclass = ""
                        }
                        else
                        {
                            var filename = "";
                            var tclass = "noupperborder"
                        }
                        var roicolor = "rgb(" + KColor.list[roi.color].join(',') +")";

                        if( t > 0)
                            filename = "";

                        $("<td class='"+tclass+"'>" + filename + "</td>").appendTo($trow);
                        if(stats.mean.length>1)
                            var tp = ("0"+ (t+1).toString()).slice(-2);
                        else
                            var tp = "";

                        var currentTimePointROI =  t>roi.content.numTimePoints-1?roi.content.numTimePoints-1:t
                        var currentTimePointIMG =  t>img.numTimePoints-1?img.numTimePoints-1:t


                        $("<td class=''>" + currentTimePointIMG + "</td>").appendTo($trow);

                        $("<td style=''>" + roi.filename        +"</td>").appendTo($trow);

                        $("<td class=''>" + currentTimePointROI + "</td>").appendTo($trow);

                        $("<td style='background:"+roicolor+";width:8px;'>" +"</td>").appendTo($trow);

                        $("<td>" + stats.median[t].toFixed(3)       +"</td>").appendTo($trow);
                        $("<td>" + stats.iqr1[t].toFixed(3)       +"</td>").appendTo($trow);
                        $("<td>" + stats.iqr2[t].toFixed(3)       +"</td>").appendTo($trow);

                        $("<td>" + stats.mean[t].toFixed(3)       +"</td>").appendTo($trow);
                        $("<td>" + stats.std[t].toFixed(3)       +"</td>").appendTo($trow);

                        $("<td>" + stats.vol[t].toFixed(3)      +"</td>").appendTo($trow);
                        $("<td>" + stats.area[t].toFixed(3)      +"</td>").appendTo($trow);
                    }

                }
            }

        }

        that.dostats = dostats;

        return that;
    }

    /***************************************************************************************
   * the panel and the activation
   ****************************************************************************************/

    that.panelEnabled = false;
    // needs a medViewer as target
    that.$pencil = $("<div class='roiTool_pencil'></div>").append($("<div class='roiTool_pencil_haircross left'></div>")).append($("<div class='roiTool_pencil_busy'><i class='fa fa-spinner fa-spin'></i></div>")).append($("<div class='roiTool_pencil_haircross right'></div>")).hide().appendTo(document.body);

    // check if any roi is enabled for drawing in any viewport, and set panel active / inactive
    function checkForAnyActiveRoi()
    {
        /*
		var found = false;
		for(var v = 0; v<KViewer.viewports.length; v++)
		{
			var viewer = KViewer.viewports[v].getCurrentViewer();
			if(viewer==undefined)
				continue;
			for (var k = 0; k < viewer.ROIs.length;k++)
			{
				if (viewer.ROIs[k].isCurrent)
				{
				   found = true;
				   break;
				}
			}
		}
		*/
        // there is always an activ roi
        found = currentROI != undefined;
        if (!found)
        {
            that.roiPanel.$drawingEnabledSign.hide();
        }
        //that.roiPanel.$container.find(".roiTool_panel_flex").addClass("inactive");
        else
        {
           that.roiPanel.$drawingEnabledSign.show();
        }
        //that.roiPanel.$container.find(".roiTool_panel_flex").removeClass("inactive");
        return found;
    }
    that.checkForAnyActiveRoi = checkForAnyActiveRoi;


    that.togglePen = function(state)
    {
        that.penEnabled = state;

    }



    /***************************************************************************************
   * the pencil
   ****************************************************************************************/
    var pencil = {
        radius: 20,
        radius_z: 3,
        thres: 0,
        thres_low:0,
        thres_high:"off"
    };
    that.pencil = pencil;
    that.smartpaw = false;
    that.regionGrow = false;

    that.penEnabled = false;
    that.threspen = 0;

    that.pensizechange = pensizechange;
    function pensizechange(ev, which, medViewer)
    {
        if (ev.myScrollAmount !== undefined) // pensizechange was triggered by shift + mousescroll
        {
            var newval = pencil[which] + ev.myScrollAmount;
            if (newval >= 0)
            {
                pencil[which] = newval;
                that.roiPanel.$inplaneradius.val(newval);
                drawPen(ev, medViewer);
            }

        }
        else
        {
            var prop = parseFloat($(ev.target).val());
            if(prop<0)
                prop=0;
            pencil[which] = prop;
        }
    }



    var $innerDIV = $("<div class='roiToolContainer'></div>").appendTo(that.$container);

    that.$panelcontainer = $("<div class='roiToolPanelContainer'></div>").appendTo($innerDIV);
    that.$tablecontainer = $("<div class=''></div>").appendTo($innerDIV);
    var $table = $("<table class='localfiletable'></table>").appendTo(that.$tablecontainer);


    /***************************************************************************************
   * the colors
   ****************************************************************************************/

    var colors = KColor.list;
    that.colors = colors;
    function componentToHex(c) {
        var hex = c.toString(16);
        return hex.length == 1 ? "0" + hex : hex;
    }
    function RGB2HTML(r, g, b) {
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }


    update();

    /***************************************************************************************
   * resize handler
   ****************************************************************************************/

    that.resize = function(hei)
    {
        that.$container.height(hei);
        $innerDIV.height(hei - that.$container.find('.KToolsTopMenu').height());


    }


    /***************************************************************************************
   * clear all
   ****************************************************************************************/

    function clearAll()
    {

        for (var r in ROIs)
            deleteReferencesOnROI(ROIs[r].fileID);

        ROIs = {};
        that.ROIs = ROIs;
        update();
        signalhandler.send("positionChange");
    }
    that.clearAll = clearAll;


    function deleteReferencesOnROI(id)
    {
        KViewer.iterateMedViewers(function (medViewer) {
                for (var j = 0; j < medViewer.ROIs.length; j++)
                {
                    if (medViewer.ROIs[j].roi.fileID == id)
                        medViewer.ROIs[j].close();
                }

        });
    }


    /***************************************************************************************
   * add/newROI callback
   ****************************************************************************************/

    function addROI()
    {
        var fid;
        for (var k in patientTableMirror.filesSelected.objs)
        {
            fid = k.split(riddelim);
            fid = fid[fid.length - 1];
        }
        if (fid == undefined)
        {
            alertify.alert("select a file as template");
            return;
        }
        alertify.prompt("ROI name", function(e, name) {
            if (e)
                pushROI(fid, name);
        });
    }


    /***************************************************************************************
   * addROI on drop
   ****************************************************************************************/
    var $container = that.$container;
    new Dragster($container.get(0));
    var $dropIndicator = undefined;

    $container.get(0).addEventListener('dragenter', showDropIndicators);
    $container.get(0).addEventListener('dragster:leave', hideDropIndicators);
    function showDropIndicators(ev)
    {

        if (!isDragFromRoiTool(ev) && tempObjectInfo != undefined && tempObjectInfo.length > 0 && $dropIndicator == undefined)
        {
            if (tempObjectInfo[0].mime != "nii")
                return;
            $dropIndicator = $("<div class='dropindicator_general_vert' ></div>").appendTo($container);
            that.dragster = {};
            that.dragster.emptyRoi = $("<div>create empty roi</div>").appendTo($dropIndicator);
            // this is not fully implemented yet: depends from where the drop will come from
            if(tempObjectInfo[0].intent && tempObjectInfo[0].intent.clim)
            {
                that.dragster.upperThresh =  $("<div>From upper threshold</div>").appendTo($dropIndicator);
                that.dragster.lowerThresh =  $("<div>From lower threshold</div>").appendTo($dropIndicator);
            }

            $dropIndicator.width($container.width());
            $dropIndicator.height($container.height() - 25);
            $dropIndicator.offset($innerDIV.offset())
            $dropIndicator.children().each(function(k,e){
    	       $(e).on('dragover',  function(ev){ $(e).css('background', 'rgba(0,139,139,0.6)');})
    	       $(e).on('dragleave', function(ev){ $(e).css('background', '');})
    	      });

            //$dropIndicator.fadeIn(150);
        }
        ev.preventDefault();
        ev.stopPropagation();
        return false;

    }


    function hideDropIndicators(ev)
    {
        if($dropIndicator != undefined)
            $dropIndicator.fadeOut(150, function(){$(this).remove(); })
        $dropIndicator = undefined;
        ev.preventDefault();
        ev.stopPropagation();
        return false;
    }


    $container.on("dragenter dragleave dragover", function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
    });
    $container.on("drop", function(ev) {
        ondrop(ev);
        hideDropIndicators(ev);
        cleanAllDropIndicators();
        return false;
    });


    function ondrop(ev)
    {
        if (ev.isDefaultPrevented())
            return;
        ev.preventDefault();
        ev.stopPropagation();
        if (that.viewport != undefined)
            that.viewport.hideDropIndicators();
        if (ev.originalEvent.dataTransfer.getData("fromfiletable"))
        {
            for (var k = 0; k < tempObjectInfo.length; k++)
            {
                if (tempObjectInfo[k].type == "file")
                {
                    var fid = tempObjectInfo[k].fileID;
                    if (tempObjectInfo[k].tag.search("/mask/") != -1)
                    {
                        createRoisFromFileID(fid, "frommaskfile");
                    }
                    else
                    {
                        var fromviewport =  (tempObjectInfo[0].intent && tempObjectInfo[0].intent.clim) ;
                        if( ev.originalEvent.target == that.dragster.emptyRoi.get(0) )
                            createRoisFromFileID(fid);
                        else if(fromviewport && ev.originalEvent.target == that.dragster.upperThresh.get(0) )
                            createRoisFromFileID(fid, "upper" + tempObjectInfo[0].intent.clim[0]);
                        else if(fromviewport && ev.originalEvent.target == that.dragster.lowerThresh.get(0) )
                            createRoisFromFileID(fid, "lower" + tempObjectInfo[0].intent.clim[0]);
                    }
                }
            }
        }
        else // a file drop from local
        {
            params = getloadParamsFromDrop(ev.originalEvent, {});
            for (var k = 0; k < params.length; k++)
                createRoisFromFileID(params[k], "frommaskfile");

        }

    }

    /***************************************************************************************
   * create the ROI from a viewport nifti adder
   ****************************************************************************************/
    function createRoisFromFileID(templateFileID, lims, viewport, roistring)
    {
        if(roistring==undefined)
            roistring =  KViewer.dataManager.getNextIteratedFilename('mask_untitled');// + Object.keys(ROIs).length;

        var roinames = roistring.replace("\n", '').split(',')

        for (var k = 0; k < roinames.length; k++)
        {
            var name = roinames[k].trim().replace(/\s/g, '');

            // lims shall be 'upper_<number>' if set ...
            pushROI(templateFileID, name, lims,
            function arrived(fobj)
            {
                if (viewport != undefined) // set only in one specific
                {
                    viewport.setContent(fobj, {
                        intent: {
                            ROI: true
                        }
                    });
                    //viewport.ROIs[viewport.ROIs.length - 1].makeCurrent();
                }
                else // set in all vps
                {
                    master.iterateMedViewers(function(m) {
                        if (m.nii !== undefined)
                            m.viewport.setContent(fobj, {
                                intent: {
                                    ROI: true
                                }
                            });
                    })
                }
                that.makeCurrentGlobal(fobj.fileID)
            });
        }
    }
    that.createRoisFromFileID = createRoisFromFileID;





    /***************************************************************************************
   * create the ROI add to list
   ****************************************************************************************/

    function pushROI(params_or_fid, name, lim, arrived, progress,createparams)
    {
        // why this? do not re-create a ROI?
        // with this set, we cannot clone a ROI ...
        /*
        if (ROIs[params_or_fid] != undefined)
            return;
        */


        if (progress == undefined)
            progress = that.progressSpinner;

        progress("creating ROI");
        var params;
        if (params_or_fid.fileID == undefined)
            params = {
                URLType: "serverfile",
                fileID: params_or_fid,
                filename: name,
                intent: {}
            };
        else
            params = params_or_fid;


        master.dataManager.loadData($.extend(
        {
            progressSpinner: function(perc, t) {},
            callback: function()
            {
                if (name == 'mask_untitled')
                    name = name + Object.keys(ROIs).length;

                var fobjs = master.dataManager.cloneAsROI(params.fileID, name, lim,createparams);

                for (var k = 0; k < fobjs.length; k++)
                {
                    var fobj = fobjs[k];


                    if (ROIs[fobj.fileID] == undefined)
                    {
                        ROIs[fobj.fileID] = fobj;
                        fobj.color = Object.getOwnPropertyNames(ROIs).length % colors.length;
                        if (KViewer.defaults.ROI)
                        {
                            if (KViewer.defaults.ROI.color)
                                fobj.color = KViewer.defaults.ROI.color;
                        }
                        // unique color for rois
                    }
                }
                that.update();
                if (arrived != undefined)
                    arrived(fobj);

                signalhandler.send("roiListUpdate");

                signalhandler.send("positionChange");
                progress();

            }
        }, params));

        //     if (!that.enabled)
        //         that.$toggle.trigger('click');
    }
    that.pushROI = pushROI;

    /***************************************************************************************
   * creation/updating of the ROI table
   ****************************************************************************************/
   that.resetRoiVolume = function(roi)
   {
        $table.find( $("[id='KROI_" + roi.fileID + "']") ).find('.roivolume').text('---');
   }

    /***************************************************************************************
   * creation/updating of the ROI table
   ****************************************************************************************/

    function update()
    {

        that.currentrow = undefined;
        $table.children().remove();



        if ($.isEmptyObject(ROIs))
        {
            $table.append($("<div class='dummymessage'> drop template image to create new ROI(s)<br> </div> "));
            return;
        }


        var $thead = $("<thead>").appendTo($table);
        var $row = $("<tr></tr>").appendTo($thead);
        $row.append($("<td class='fixedwidth' fixedwidth='8'><i class='fa fa-fw  fa-square-o'></i> </td>").click(function(e) {
            toggle_all_visible();
        }));
        $row.append($("<td class='fixedwidth' fixedwidth='13'> </td>"));
        //$row.append($("<td class='fixedwidth' fixedwidth='6'> </td>"));
        $row.append($("<td>ROI filename</td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'><i class='fa  fa-fw'></i> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td class='fixedwidth' fixedwidth='9'> </td>"));
        $row.append($("<td style='white-space:nowrap'>&nbsp;<i class='fa fa-refresh'></i> &nbsp; mL </td>").click( calcVolumes)  );
        $row.append($("<td>matrix </td>"));
        $row.append($("<td>patientID</td>"));
        $row.append($("<td>studyID</td>"));

        function calcVolumes()
        {
            for (var k in ROIs)
            {
                var r = ROIs[k].content;
                var totsz = r.sizes[0] * r.sizes[1] * r.sizes[2];
                var numvox = 0;
                for (var j = 0; j < totsz; j++)
                    if (r.data[j] > 0.5)
                        numvox++;
                var vol = numvox * r.voxSize[0] * r.voxSize[1] * r.voxSize[2]; // in mm³
                vol = Math.round( (vol/1000 * 100))/100; // in mL

                var $td = $table.find( $("[id='KROI_" + ROIs[k].fileID + "']") ).find('.roivolume');
                $td.text(vol);
            }
        }

        var $tbody = $("<tbody>").appendTo($table);
        // sort the ROIs by name
        var roilistsorted = [];
        for (var k in ROIs)
            roilistsorted.push(ROIs[k]);
        roilistsorted = roilistsorted.sort(function(a,b) { return (a.filename>b.filename?1:-1); })

        /**************** roigroups ************************/
        var roigroups = [];
        /*
        var roigroups =
        [
            {title:'NEW   lesions', prefix:'NEW_', color: 'red'},
            {title:'GROWN lesions', prefix:'GRO_', color: 'yellow'} ,
            {title:'OLD   lesions', prefix:'OLD_', color: 'lightgreen'},
        ]
        if(roigroups.length > 0)
        {
            var roilistsortedbygroup = [];
            var remainders = [];
            for(var g=0;g<roigroups.length; g++)
            {
                roilistsortedbygroup.push(roigroups[g])
                for (var z=roilistsorted.length-1; z>-1; z-- )
                {
                    if(roilistsorted[z].filename.substr(0,roigroups[g].prefix.length) == roigroups[g].prefix)
                        roilistsortedbygroup.push(roilistsorted.splice(z,1)[0]);
                }

            }
            roilistsortedbygroup.push({title:'OTHERS', prefix:'', color: 'lightgray'})
            roilistsorted = roilistsortedbygroup.concat(roilistsorted);
        }
*/

        //for (var k in ROIs)
        for (var z=0; z<roilistsorted.length; z++ )
        {
            if(roigroups.length>0 && roilistsorted[z].fileID==undefined )
            {
                var $row = $("<tr class='roiTool_filelist_filerow'></tr>").appendTo($tbody);
                $("<td class='' colspan='100' style='background:"+ roilistsorted[z].color+"'><span>"+roilistsorted[z].title+"</span></td>").appendTo($row)
                continue
            }

            k=roilistsorted[z].fileID;
            var fobj = ROIs[k];
            var id = fobj.fileID;
            var dragstuff = "draggable='true'"
//            var dragstuff = "draggable='true' data-filename='" + fobj.filename + "' data-type='file' data-tag='/mask/' data-fileID='" + id + "' data-mime='ROI'";
  //          dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ";
            var $row = $("<tr class='roiTool_filelist_filerow' id ='KROI_" + id + "' " + dragstuff + " ></tr>").appendTo($tbody);

            $row.on("dragstart", dragstarter(function(fobj) { return function() {
                return {
                    type: 'file',
                    mime: 'nii',
                    tag: '/mask/',
                    filename: fobj.filename,
                    fileID: fobj.fileID,
                    intent: {
                        color: fobj.color
                    },
                    close: close
                }
            } }(fobj))  );


            if (currentROI == fobj)
                $row.addClass('selected')

            var makeCurrentGlobal_ = function(z) {
                return function(ev)
                {
                    that.makeCurrentGlobal(z);
                }
            }(k);

            $row.append($("<td class='fixedwidth'><i class='vis fa fa-fw fa-square-o'></i> </td>").click(function(e)
            {
                toggle_visibility(e.target);
                signalhandler.send("positionChange");
            }));

//             var $hand = $("<td class='fixedwidth'><i class='fa fa-fw fa-hand-paper-o'></i> </td>").click(makeCurrentGlobal_)
//             //$row.append($("<td><i class=' fa fa-fw fa-pencil-square-o'></i></td>").click(makeCurrentGlobal_ ));
//             if (fobj.color != undefined)
//                 $hand.css('background', (new KColor(KColor.list[fobj.color])).getCSS() );
//             $row.append($hand);


            // color contextmenu
            var $colselector = KColorSelector(that.colors,
                function(c) {
                    return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
                },
                function(obj,id){return function()
                {
                     that.setColorGlobal(id, obj.color)
                }}(fobj,id)
                ,fobj
               );
            $row.append($colselector)
            $colselector.find("i").css('margin-right', '-5px')

            var $namediv = $("<span  id ='KROINAME_" + id + "' contenteditable='false' >" + fobj.filename + " </span>")
            .keydown(function(ev) {
                if (ev.keyCode == 13) {
                    $(ev.target).blur();
                    return false
                }
            })
            .keyup(function(sel) {
                return function(ev)
                {
                    sel.filename = $(ev.target).text().trim();
                    if (sel.namedivs != undefined)
                        for (var i = 0; i < sel.namedivs.length; i++)
                            $(sel.namedivs[i]).text(sel.filename);
                }
            }(fobj)
            )
            
            if(KViewer.static.roilist_contextmenu !== false)
                makeEditableOnDoubleClick($namediv)
                
            var $treexpander
            if (fobj.ccanalysis == undefined || !fobj.ccanalysis.enabled)
                $treexpander = $("<i class='fa fa-fw fa-plus-square-o'></i>");
            else
                $treexpander = $("<i class='fa fa-fw fa-minus-square-o'></i>");
            var $namewrap = $("<div>  </div>").append($treexpander).append($namediv).on('click', makeCurrentGlobal_)
            $row.append($("<td></td>").append($namewrap));


            $treexpander.click(function(fobj) { return function()
            {
               if (fobj.ccanalysis != undefined)
               {
                  fobj.ccanalysis.enabled = !fobj.ccanalysis.enabled;
                  if (fobj.ccanalysis.enabled)
                    fobj.ccanalysis.update();
               }
               else
               {
                  createConnCompAnalysis(fobj);
               }

               KViewer.roiTool.update();

            }}(fobj) );

            // ROI's contextmenu
            var tools_contextmenu = function(fobj) { return KContextMenu(
            function() {

                var $menu = $("<ul class='menu_context'>");
                $menu.append($("<li onchoice='clear'> clear  </li>"));
                $menu.append($("<li onchoice='clone'> clone  </li>"));
                $menu.append($("<li onchoice='invert'> invert  </li>"));
                $menu.append($("<hr>"));                
                $menu.append($("<li onchoice='mergeAND'> intersection of selected ROIs </li>"));
                $menu.append($("<li onchoice='mergeOR'> union of selected ROIs  </li>"));
                $menu.append($("<li onchoice='mergeDIFF'> set difference  </li>"));

                $menu.append($("<hr>"));
                $menu.append($("<li onchoice='fillholes'> fill holes  </li>"));

                var thres = removesalt.threshold;

                var $salt_threshold = $("<input onchoice='preventSelection' type='number' step='5' min='2' max='10000'>").val(thres).
                     on('keyup', function(ev) {
                    var $input = $(ev.target);
                    removesalt.threshold = $input.val();
                   });

                $menu.append($("<li onchoice='removesalt'> remove salt </li>").append($salt_threshold));
                $menu.append($("<li onchoice='splatter'> splatter </li>"));
                if (KViewer.currentPoint != undefined)
                {
                    var str = "("+KViewer.currentPoint._data[0].toFixed(0)+","+KViewer.currentPoint._data[1].toFixed(0)+","+KViewer.currentPoint._data[2].toFixed(0)+")"
                    $menu.append($("<li onchoice='crop'> crop at seed "+str+" </li>"));
                }
                $menu.append($("<hr>"));                
                $menu.append($("<li onchoice='opening'> opening  </li>"));
                $menu.append($("<li onchoice='closing'> closing  </li>"));
                $menu.append($("<li onchoice='erode'> erosion  </li>"));
                $menu.append($("<li onchoice='dilate'> dilation  </li>"));
                $menu.append($("<hr>"));
                if (0) //fobj.content.numTimePoints  > 1)
                {                    
                    $menu.append($("<li onchoice='logic4D'> logical op. along 4th dim.  </li>"));
                    $menu.append($("<hr>"));
                }
                $menu.append($("<li onchoice='extend4d'> extend 4th dimension </li>"));                
                $menu.append($("<li onchoice='surface'> create surface </li>"));
                $menu.append($("<li onchoice='download'> download </li>"));
                $menu.append($("<li onchoice='saveas'> save as ... </li>"));
                $menu.append($("<li onchoice='close'> close </li>"));
                return $menu;
            }
            ,function(str, ev) {
                    var id = fobj.fileID;
                    tools(str, ev, id)
            },true
            ) }(fobj)

            if(KViewer.static.roilist_contextmenu !== false)
                $row.on("contextmenu",tools_contextmenu);



            $row.append($("<td class='fixedwidth'><i class='tablebutton fa fa-fw fa-binoculars'></i> </td>").click(function(e) {
                var target = e.target;
                while (!$(target).is("tr"))
                    target = $(target).parent();
                var id = $(target).attr("id").substring(5);
                set_to_center(ROIs[id].content);
            }));

            var $currentdiv = $("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-pencil-square-o'></td>").appendTooltip('toggleedit');
            $row.append($currentdiv.click(function(id) { return function()
            {
                   that.makeCurrentGlobal(id);
            } }(fobj.fileID) ) );

            if ((currentROI == fobj))
                $currentdiv.find(".fa").addClass("selected");




            

            // toggle visibility global
            var $eyetoogle = $("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-eye'></td>").appendTo($row).appendTooltip('toggle')
            $eyetoogle.click(function(fobj, $eyetoogle){
                return function(){
                    if(fobj.visible==1 || fobj.visible==undefined )
                    {
                        fobj.visible = 0;
                        $eyetoogle.find('i').addClass('fa-eye-slash').removeClass('fa-eye').css('color', 'red');
                    }
                    else
                    {
                        fobj.visible = 1;
                        $eyetoogle.find('i').removeClass('fa-eye-slash').addClass('fa-eye').css('color', '');
                    }
                    KViewer.iterateMedViewers(function(viewer)
                    {
                        for (var k = 0; k < viewer.ROIs.length; k++)
                        {
                            if(viewer.ROIs[k].roi.fileID == fobj.fileID)
                            {
                                viewer.ROIs[k].toggle_visibility(fobj.visible)
                            }
                        }
                    });
                }
            }(fobj, $eyetoogle))

            if(fobj.visible === 0)
                  $eyetoogle.find('i').addClass('fa-eye-slash').removeClass('fa-eye').css('color', 'red');


            $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-wrench'></td>").click(tools_contextmenu));
            $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-save'></td>").click(saveROI_table).appendTooltip('saveroi'));
            $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-download'></td>").click(function(fobj) { return function(){
                saveNiftilocal(fobj)}
            }(fobj)).appendTooltip('downloadroi'));
            $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-eraser'></td>").click(function(fobj,id) { return function(){
                KViewer.roiTool.history.record('startRecording', that.roiPanel.getParentViewer(),fobj);
                var changedPoints = clearROI(fobj)
                that.history.add(changedPoints, 1,fobj);
                $(".KROI_"+id).remove()
                }
            }(fobj,id)).appendTooltip('clear'));
            $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-trash'></td>").click(delROI).appendTooltip('delete'))
            $row.append($("<td style='text-align:right' class='roivolume'>---</td>"));
            $row.append($("<td><span>" + fobj.content.sizes[0] + "," + fobj.content.sizes[1] + "," + fobj.content.sizes[2]+ "," + fobj.content.sizes[3] + "</span></td>"));
            $row.append($("<td>" + fobj.fileinfo.patients_id + "</td>"));
            $row.append($("<td>" + fobj.fileinfo.studies_id + "</td>"));

            if (fobj.ccanalysis && fobj.ccanalysis.enabled)
            {
                var cc = fobj.ccanalysis;
                if (cc.persistent != undefined)
                {
                    for (var j=0; j<cc.persistent.length;j++)
                    {
                        var $row = $("<tr class='islandrow KROI_" + id + "' kid='KROI_" + id + "' label='" + j +"'></tr>").appendTo($tbody);
                        if (currentROI == fobj)
                            $row.addClass('selected')
                        $row.on("contextmenu", function(fobj,conncomp_label) { return function(ev) {
                            contextMenuLabel(fobj,conncomp_label,undefined,ev)
                        }
                        }(fobj,cc.persistent[j]));

                        $row.append($("<td> </td>"));
                        $row.append($("<td> </td>"));
                        var $namediv = $("<td class='namediv'> "+  that.conncompdesc + " " + cc.persistent[j].name +"</td>").keydown(function(ev) {
                                if (ev.keyCode == 13) {
                                    $(ev.target).blur();
                                    return false
                                }
                            }).keyup(function(sel) {
                                return function(ev)
                                {
                                    sel.name = $(ev.target).text().trim();
                                }
                            }(cc.persistent[j])
                            )
                         //makeEditableOnDoubleClick($namediv)
                         $row.append($namediv);


                         function jumpTo(e)
                         {
                                var target = e.target;
                                while (!$(target).is("tr"))
                                    target = $(target).parent();
                                var id = $(target).attr("kid").substring(5);
                                var label = $(target).attr("label");
                                $(target).parent().find("tr").removeClass("current");
                                $(target).addClass("current");
                                var cc = ROIs[id].ccanalysis;
                                var v = cc.persistent[label].cog;
                                KViewer.currentPoint = math.multiply(ROIs[id].content.edges,[v[0],v[1],v[2],1]);
                                signalhandler.send('positionChange',{point:KViewer.currentPoint});

                                that.currentrow =  $(target);




                         }
                         $namediv.click(jumpTo)

                         //$row.append($("<td class='fixedwidth'><i class='tablebutton fa fa-fw fa-binoculars'></i> </td>").click(jumpTo));
                         $row.append($("<td> </td>"));

                         $row.append($("<td> </td>"));
                         $row.append($("<td> </td>"));
                         $row.append($("<td> </td>"));
                         $row.append($("<td> </td>"));
                         $row.append($("<td> </td>"));
                         //$row.append($("<td> </td>"));
                         $row.append($("<td class='fixedwidth'> <i class='tablebutton fa fa-fw fa-eraser'></td>").click(
                                function(fobj,conncomp_label,$row) { return function(ev) {

                                var point = math.multiply(fobj.content.edges, [conncomp_label.cog[0],conncomp_label.cog[1],conncomp_label.cog[2],1]);
                                 delROI_component(fobj, point)
                                 $row.remove();

                                 }}(fobj,cc.persistent[j],$row)
                         ));
                         $row.append($("<td> </td>"));


                         if (cc.persistent[j].idx != undefined)
                         {
                             var r = ROIs[id].content;
                             var clusterVolume = cc.cc.clusterSize[cc.persistent[j].idx] *r.voxSize[0] * r.voxSize[1] * r.voxSize[2] / 1000;
                         }
                         else
                             clusterVolume = 0;
                             $row.append($("<td> "+ math.round(clusterVolume*100)/100 +"</td>"));
                    }
                }
            }
        }

        that.attachTableOperator($table.parent());

        function delROI_component(fobj, point,timerange)
        {
            var cp = [];
            if (timerange == 'all')
            {
                for (var k = 0; k<fobj.content.numTimePoints;k++)
                  cp = cp.concat(cropConnectedComponent2(fobj,undefined, point,k))
            }
            else
                cp = cropConnectedComponent2(fobj,undefined, point)
            signalhandler.send("updateImage",{id: fobj.fileID});
            KViewer.roiTool.history.record('startRecording', undefined ,fobj, 'use_as_last');
            KViewer.roiTool.history.add(cp, 1,fobj);
        }
        that.delROI_component = delROI_component;
        function keepROI_component(fobj, point,timerange)
        {
            var cp = [];
            if (timerange == 'all')
            {
                for (var k = 0; k<fobj.content.numTimePoints;k++)
                    cp.concat(cropConnectedComponent2(fobj,"keep", point,k))
            }
            else
                cp = cropConnectedComponent2(fobj,"keep", point)
            signalhandler.send("updateImage",{id: fobj.fileID});
            KViewer.roiTool.history.record('startRecording', undefined ,fobj, 'use_as_last');
            KViewer.roiTool.history.add(cp, 1,fobj);
        }
        that.keepROI_component = keepROI_component;

        function delROI(ev)
        {
            var id;

            if (ev.target != undefined)
            {
                var target = ev.target;
                while (!$(target).is("tr"))
                    target = $(target).parent();
                id = $(target).attr("id").substring(5);
            }
            else
                id = ev;


            if (ROIs[id].worker != undefined)
            {
                 ROIs[id].worker.postMessage({msg:'kill'})
                 ROIs[id].worker = undefined;
            }


            delete ROIs[id];
            if (that.visibleROIs[id])
            {
                delete that.visibleROIs[id];
            }

            deleteReferencesOnROI(id);

            that.update();
            signalhandler.send("roiListUpdate");

        }
        that.deleteROI = delROI;


        function saveROI_table(ev)
        {
            var target = ev.target;
            while (!$(target).is("tr"))
                target = $(target).parent();
            var id = $(target).attr("id").substring(5);
            var roi = ROIs[id];

            saveROI(roi)
        }




        function namechange(ev)
        {
            var id = $(ev.target).attr("id").substring(9);
            ROIs[id].filename = $(ev.target).text();
            return true;
        }


        master.cacheManager.update();


    }
    that.update = update;


    $table.on("mouseenter",function() { that.hasMouse = true })
    $table.on("mouseleave",function() { that.hasMouse = false })

    window.addEventListener("keyup",function(evt) 
    {
       if (that.currentrow != undefined && that.hasMouse
           && (evt.keyCode == 38 | evt.keyCode == 40) && !evt.shiftKey && !evt.ctrlKey)
       {

           evt.stopPropagation();
           evt.preventDefault();
           var n;
           if (evt.keyCode == 40)
              n = that.currentrow.next("tr")
           if (evt.keyCode == 38)
              n = that.currentrow.prev("tr")
           if (n == undefined)
              return;
           n.find(".namediv").trigger("click")
       }
    },{capture:true})
 


    /***************************************************************************************
    * save a roi
    ****************************************************************************************/

    function saveROI(roi, saveas)
    {
        runROIworker('clean',roi,{noupdate:true}, function()
        {

            if (typeof customUploadNifti != "undefined")
            {
                customUploadNifti(roi)
            }
            else if (userinfo.username == guestuser)
            {
                saveNiftilocal(roi);
            }
            else
            {
                var doUpload = function() {

                    // add a unique patient id first if not set
                    if (roi.fileinfo.patients_id == undefined)
                       extendWithUniquePSID(roi.fileinfo);

                    var zipped = true;

                    if (roi.fileinfo && roi.fileinfo.Filename && roi.fileinfo.Filename.search("\\.gz") == -1)
                        zipped = false;
                    if (roi.notzipped)
                        zipped = false;

                    if (roi.fileinfo.patients_id != undefined)
                    {
                            uploadUnregisteredBinary(roi, {
                                SubFolder: roi.subfolder,
                                Tag: "/mask/",
                                permission: "rwp"
                            }, that.progressSpinner,
                            function(newid, id) {
                                ROIs[newid] = roi;
                                delete ROIs[id];
                                that.update();
                            },zipped);
                    }
                    else
                    {
                        alertify.alert("There is no unique patient id set for this roi.")
                    }
    
                }

                if (saveas == true)
                {
                    if( (roi.filename.substring(0, 13) == "mask_untitled" & roi.fileID.substring(0, 3) == "ROI"))
                    {
                        alertify.prompt("Name of the ROI?", function(e, str)
                        {
                            if (e)
                            {
                                var idx = str.lastIndexOf('/');
                                if (idx > -1)
                                {
                                    roi.subfolder = str.substring(0, idx);
                                    roi.filename = str.substring(idx + 1);
                                }
                                else
                                {
                                    roi.subfolder = "";
                                    roi.filename = str;
                                }
                                for (var i = 0; i < roi.namedivs.length; i++)
                                    $(roi.namedivs[i]).text(roi.filename);
                                doUpload();
                            }
                        }, roi.filename);
                    }
                }
                else
                    doUpload();
            }
        }
        )
    }

    /***************************************************************************************
    * save all ROIs
    ****************************************************************************************/
    function saveAllROIs()
    {
        for(k in that.ROIs)
        {
            saveROI( that.ROIs[k], false);
        }

    }
    that.saveAllROIs = saveAllROIs;

    
    function clearROI(fobj)
    {
        var changedPoints = [];
        for (var k = 0; k < fobj.content.data.length; k++)
        {
            if (fobj.content.data[k] > 0)
                changedPoints.push(k);
            fobj.content.data[k] = 0;
        }
        if (fobj.content.onVoxels != undefined)
            fobj.content.onVoxels = undefined;

        signalhandler.send("positionChange");
        update3D(fobj);

        return changedPoints;
    }



    /***************************************************************************************
    * context menu callbacks
    ****************************************************************************************/
    function update3D(roi,progress)
    {
        var fileinfo;
        if (roi.fileinfo)
            fileinfo = roi.fileinfo
        if (roi.currentFileinfo)
            fileinfo = roi.currentFileinfo;
        if (fileinfo == undefined)
            return;

        if (fileinfo && fileinfo.surfreference)
        {
            var surf = fileinfo.surfreference;
            if (surf.hangingUpdate == 0 | surf.hangingUpdate == undefined)
                surf.hangingUpdate = 1;
            else if (surf.hangingUpdate >= 1)
            {
                surf.hangingUpdate = 2;
                return;
            }

            var labelObj;
            if (roi.type == "overlay" || roi.type == 'mainview')
                 labelObj = {threshold:roi.histoManager.clim[0]};


            if (progress == undefined)
                progress = that.progressSpinner;

            KViewer.obj3dTool.computeIsoSurf2(surf,labelObj,progress,function()
            {
                if (surf.hangingUpdate == 2)
                {
                    surf.hangingUpdate = 0;
                    update3D(roi);
                }
                else
                {
                   for (var k = 0; k < surf.content.update.length; k++)
                        surf.content.update[k]();
                }
                surf.hangingUpdate = 0;

            });
        }
    }
    that.update3D = update3D;


    function runROIworker(func,fobj,params,callback,progress)
    {  
        $(document.body).addClass('wait');

        if (params == undefined)
            params = {}
        var eobj = {func:func,
                    buf: fobj.content.buffer,
                    data:fobj.content.data,
                    size:fobj.content.sizes,
                    keepOpen:false }
        eobj = $.extend(eobj,params)
        if (progress == undefined)
            progress = function (e) {}
        var worker = executeImageWorker(eobj,[fobj.content.buffer], progress,
        function(e)
        {
            fobj.content.buffer = e.execObj.buf;
            fobj.content.data = new Uint8Array(fobj.content.buffer,fobj.content.hdroffset);
            if (!eobj.noupdate)
            {
                signalhandler.send("positionChange");
                update3D(fobj);
            }
            var changedPoints = e.execObj.changedPoints
            if (changedPoints != undefined)
                that.history.add(e.execObj.changedPoints, 1,fobj);
            if (callback)
                callback()
            $(document.body).removeClass('wait');

        })
    }


    function tools(str, ev, id,viewer)
    {
        if (str == undefined)
            return;

        var fobj = ROIs[id];

        KViewer.roiTool.history.record('startRecording', that.roiPanel.getParentViewer(),fobj);
        var changedPoints = [];
        var valtoset;
        if (str == "invert")
        {
            runROIworker('invert',fobj)
        }
        else if (str == "opening")
        {
            runROIworker('opening',fobj)
        }
        else if (str == "closing")
        {
            runROIworker('closing',fobj)
        }
        else if (str == "removesalt")
        {
            runROIworker('removesalt',fobj,{threshold:removesalt.threshold})
        }
        else if (str == "splatter")
        {
            splatter(fobj);
        }
        else if (str == "crop")
        {
            var nfobj = KViewer.dataManager.cloneAsROI(fobj.fileID, fobj.filename + "_cropped","upper0")[0];
            cropConnectedComponent(nfobj, KViewer.currentPoint)
            KViewer.roiTool.ROIs[nfobj.fileID] = nfobj;
            nfobj.color = Object.getOwnPropertyNames(KViewer.roiTool.ROIs).length % 5;
            KViewer.roiTool.update();
            if (viewer != undefined)
                viewer.setContent(nfobj,{intent:{ROI:true}});
        }
        else if (str == "erode")
        {
            runROIworker('erode',fobj)
        }
        else if (str == "dilate")
        {
            runROIworker('dilate',fobj)
        }
        else if (str == "clear")
        {
            changedPoints = clearROI(fobj)
        }
        else if (str == "clone")
        {
            createRoisFromFileID(id, "upper0.5", undefined, undefined)
            //pushROI(id, "untitled", );
        }
        else if (str == "fillholes")
        {
            runROIworker('fillholes',fobj)

        }
        else if (str == "mirror")
        {
            mirror_roi(fobj, $(ev.target).attr('dim'));
            //runROIworker('fillholes',fobj)
        }
        else if (str == "threshold_upper" | str == "threshold_lower")
        {
            var eqfun;
            var mview = that.roiPanel.getParentViewer();
            var clim = mview.histoManager.clim;
            var parentnii = mview.content.content;
            var low = clim[0];

            if (str == "threshold_upper")
                eqfun = function(x) {
                    return x > low
                }
                ;
            else
                eqfun = function(x) {
                    return x < low
                }
                ;

            var roi = fobj.content;

            if (roi.edges._data.toString() == parentnii.edges._data.toString())
            {
                var sz = roi.sizes[0] * roi.sizes[1] * roi.sizes[2];
                for (var z = 0; z < sz; z++)
                    roi.data[z] = eqfun(parentnii.data[z]);

            }
            else
            {
                var A = math.inv(math.multiply(math.inv(roi.edges), parentnii.edges))._data;
                for (var z = 0; z < roi.sizes[2]; z++)
                    for (var y = 0; y < roi.sizes[1]; y++)
                        for (var x = 0; x < roi.sizes[0]; x++)
                            roi.data[roi.sizes[1] * roi.sizes[0] * z + roi.sizes[0] * y + x] = eqfun(trilinInterp(parentnii, x, y, z, A, 0));
            }
            signalhandler.send("positionChange");
            update3D(fobj);
        }
        else if (str == "mergeAND" | str == "mergeOR" | str == "mergeDIFF")
        {
            var fun;
            if (str == "mergeAND")
                fun = function(x, y) {
                    return (x > 0.5) & (y > 0.5)
                }
            else if (str == "mergeDIFF")
                fun = function(x, y) {
                    return (x > 0.5) & (y < 0.5)
                }
            else
                fun = function(x, y) {
                    return (x > 0.5) | (y > 0.5)
                }
            var rois = Object.keys(that.visibleROIs);
            for (var j = 0; j < rois.length; j++)
            {
                if (rois[j] == fobj.fileID)
                {
                   rois.splice(j,1)
                   break;
                }
            }


            var nii = fobj.content;
            for (var j = 0; j < rois.length; j++)
            {
                if ( ROIs[rois[j]].content == undefined)
                    continue;
                var roi = ROIs[rois[j]].content;
                roi.A = (math.multiply(math.inv(roi.edges), nii.edges))._data;
                for (var z = 0; z < nii.sizes[2]; z++)
                    for (var y = 0; y < nii.sizes[1]; y++)
                        for (var x = 0; x < nii.sizes[0]; x++)
                        {
                            var v = trilinInterp(roi, x, y, z, roi.A, 0);
                            nii.data[nii.sizes[1] * nii.sizes[0] * z + nii.sizes[0] * y + x] =
                            fun(nii.data[nii.sizes[1] * nii.sizes[0] * z + nii.sizes[0] * y + x], v);
                        }

            }
            update3D(fobj);
            signalhandler.send("positionChange");
        }
        else if (str == "surface")
            KViewer.obj3dTool.createSurfaceFromROI(fobj);
        else if (str == "logic4D")
        {
               var eval_str = "data[k] = data[k+totsz*2] | data[k+totsz*2]";
               var data = fobj.content.data;
               var totsz= fobj.content.sizes[0]*fobj.content.sizes[1]*fobj.content.sizes[2]*fobj.content.sizes[3]
               for (var k = 0; k < totsz;k++)
               {
                   eval(eval_str);
               }

         /*   alertify.prompt("Change 4th dimension of ROI to:", function(e, str) {
                if (e)
                {            

                }

            });*/
        }
        else if (str == "extend4d")
        {
            alertify.prompt("Change 4th dimension of ROI to:", function(e, str) {
                if (e)
                {            
                    var num = parseInt(str);
                    if (num < 1 | num > 50)
                    {
                        alertify.error("outside a valid range")
                        return;
                    }
                    if (num < fobj.content.sizes[3])
                    {
                      alertify.confirm("Are you sure? There might be data loss! ", function(e, str) {
                          if (e)
                            changeit(num)
                      })
                      return
                    }
                    else
                      changeit(num)

                    function changeit(num)
                    {
                        var nfobj = cloneNifti(fobj, fobj.filename, "uint8",num)
                        var totsz_src = fobj.content.sizes[0]*fobj.content.sizes[1]*fobj.content.sizes[2]*fobj.content.sizes[3]
                        var totsz_dest = nfobj.content.sizes[0]*nfobj.content.sizes[1]*nfobj.content.sizes[2]*nfobj.content.sizes[3]
                        if (totsz_dest < totsz_src)
                            totsz_src = totsz_dest;
                        nfobj.content.data.set(fobj.content.data.subarray(0,totsz_src))


                        fobj.content = nfobj.content
                        fobj.buffer = nfobj.buffer

                        signalhandler.send("updateFilelink",{id:fobj.fileID});
                    }
                }
            }, ""+fobj.content.sizes[3])
        }
        else if (str == "download")
            saveNiftilocal(fobj);
        else if (str == "saveas")
        {
            saveROI(fobj, true)
        }
        else if (str == "close")
            delROI(id);

        if (changedPoints != undefined && changedPoints.length > 0)
            that.history.add(changedPoints, valtoset,fobj);

    }
    that.tools = tools;







    /***************************************************************************************
     * selection of ROIs (visibility is deprecated)
     ****************************************************************************************/

    var visibleROIs = {};
    that.visibleROIs = visibleROIs;
    function toggle_visibility(target)
    {
        while (!$(target).is("tr"))
            target = $(target).parent();
        var id = $(target).attr("id").substring(5);
        var $b = $(target).find(".vis");
        $b.toggleClass("fa-square-o").toggleClass("fa-check-square-o");
        if ($b.hasClass("fa-square-o"))
            delete visibleROIs[id];
        else
            visibleROIs[id] = true;
    }

    function toggle_all_visible()
    {
        for (var k in ROIs)
            toggle_visibility($("tr[id='KROI_" + k + "']"));
        signalhandler.send("positionChange");

    }



    /***************************************************************************************
     * ROI painting
     ****************************************************************************************/
    regionGrow.helper = {
        simscaling: 0
    };


    function keepExclusive(changedPoints,medViewer,ev)
    {
        var type = that.roiMode;

        if (type == "overlap")
            return changedPoints;

        var rois = [];
        var nii =  medViewer.currentROI.content;
        for (var k = 0; k < medViewer.ROIs.length;k++)
        {
            if (medViewer.currentROI != medViewer.ROIs[k].roi &&
                medViewer.ROIs[k].nii.edges._data.toString() ==
                medViewer.currentROI.content.edges._data.toString())
            {
                rois.push(medViewer.ROIs[k].roi);

                if (ev.type == 'mousedown' && type == "override")
                    KViewer.roiTool.history.record('startRecording', medViewer,medViewer.ROIs[k].roi,'dontaddtoglobal');

            }
        }


        var roilen = rois.length;
        var plen = changedPoints.length;
        if (type == "override")
        {
            for (var k = 0; k < roilen;k++)
            {
                var cp_r = [];
                var data = rois[k].content.data;
                for (var j = 0 ;j < plen; j++)
                {
                    if (data[changedPoints[j]] > 0)
                        cp_r.push(changedPoints[j])
                    data[changedPoints[j]]=0;
                }
                that.history.add(cp_r, 0,rois[k]);
            }
            changedPoints.others = rois;

            return changedPoints;
        }
        if (type == "block")
        {
            var changedPoints_new = [];
            for (var j = 0 ;j < plen; j++)
            {
                var on = false;
                for (var k = 0; k < roilen;k++)
                {
                    var tp = changedPoints[j];
                    // if blocking roi has only one timepoint, use this
                    if(rois[k].content.numTimePoints == 1)
                        var tp = tp % nii.widheidep;

                    on = on | (rois[k].content.data[tp]>0);
                }
                if (on)
                    nii.data[changedPoints[j]] = 0;
                else
                    changedPoints_new.push(changedPoints[j]);
            }
            return changedPoints_new;
        }

    }
    that.keepExclusive = keepExclusive

    that.modifyRoi = function(ev, medViewer,callback)
    {

        if (!that.penEnabled)
            return false;

        var valtoset = (ev.buttons == 1) | ( ev.buttons == 0);
        if (ev.roipreview)
            valtoset = 255;


        // careful, firefox and chrome might behave differently
        var points_wc = medViewer.getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY)._data;
        // the function calculates real world coordinates based on the mouse event
        var slicing = medViewer.getSlicingDimOfArray();

        if (ev.type == "mousedown")
        {
            that.resetRoiVolume(currentROI);
        }


        if ((!that.regionGrow && !that.regionGrowRestric) || valtoset == 0)
        {
            // here was the evil bug!
            // ROI was modified on mouseup, but this was explicitely NOT added to history
            // For now, only allow roi modification in normal pen mode on mousedonw and mousemove, not mouseup (return)
            if(ev.type == "mouseup")
            {
                callback();
                return false;
            }

            that.modifyRoiInternal(points_wc, valtoset, slicing, medViewer, undefined, function(changedPoints)
            {
                // evil bug remainder, not sure why this was used in the first place, but had some reason once.
                 //if (ev.type != "mouseup" && valtoset != 2)
                changedPoints=keepExclusive(changedPoints,medViewer,ev);
                if (!ev.roipreview)
                    that.history.add(changedPoints, valtoset);
                callback(changedPoints);
            });
        }
        else if (that.regionGrowRestric)
        {
            if (ev.type == "mousedown")
            {
               if (regionGrow.timeout != -1)
               {
                   clearTimeout(regionGrow.timeout);
                   regionGrow.timeout = -1;
                   for (var k = 0; k < regionGrow.changedPoints.length;k++)
                       medViewer.currentROI.content.data[regionGrow.changedPoints[k]] = 0;
               }
                that.modifyRoiInternal(points_wc, valtoset, slicing, medViewer, undefined, function(changedPoints)
                {
                    changedPoints = keepExclusive(changedPoints,medViewer,ev)
                    if (!ev.roipreview)
                        that.history.add(changedPoints, valtoset);
                    callback(changedPoints);
                });


               regionGrow.changedPoints = [];
            }
            else if (ev.type == "mousemove" | ev.type == "mousewheel")
            {
                that.modifyRoiInternal(points_wc, valtoset, slicing, medViewer, undefined, function(changedPoints)
                {
                    changedPoints = keepExclusive(changedPoints,medViewer,ev)
                    if (!ev.roipreview)                    
                        that.history.add(changedPoints, valtoset);
                    callback(changedPoints);
                });
            }
            else
            {
                callback();
            }

        }
        else
        {
            if (ev.type == "mousedown")
            {
                that.$pencil.addClass('leftright busy')
                regionGrow.helper.downev = ev;
                regionGrow.helper.simscaling = 0;
                regionGrow.changedPoints = [];
                that.modifyRoiInternal(points_wc, valtoset, slicing, medViewer, undefined,function(changedPoints){
                   that.$pencil.removeClass('busy');
                   callback(changedPoints);
                });
            }
            if (ev.type == "mousemove")
            {
                regionGrow.helper.simscaling = (ev.clientX - regionGrow.helper.downev.clientX);
                points_wc = medViewer.getRealWorldCoordinatesFromMouseEvent(regionGrow.helper.downev.clientX, regionGrow.helper.downev.clientY)._data;
                that.$pencil.addClass('busy');
                that.modifyRoiInternal(points_wc, valtoset, slicing, medViewer, undefined, function(changedPoints){
                   that.$pencil.removeClass('busy');
                   callback(changedPoints);
                });
            }
            if (ev.type == "mouseup" || ev.type == "mouseleave")
            {
                KViewer.roiTool.$pencil.removeClass('leftright busy')

               if (regionGrow.timeout != -1)
                {
                    clearTimeout(regionGrow.timeout);
                    regionGrow.timeout = -1;
                    alertify.error('region growing breaked to early, keep mouse down to produce full result')
                }

                if (!ev.roipreview)     
                    that.history.add(regionGrow.changedPoints, 1);

                callback(regionGrow.changedPoints);
                regionGrow.changedPoints = [];

            }
        }


    }




    function applyPerm(idx, perm)
    {
        var newidx = [];
        for (var k = 0; k < perm.length; k++)
            newidx[perm[k]] = idx[k];
        return newidx;
    }

    that.modifyRoiInternal = function(points_wc, valtoset, slicing, medViewer, params, callback)
    {

        function updateVal(valtoset,currentIndex)
        {
            if (valtoset < 2 )
            {
                if (nii.data[currentIndex] != undefined)
                {
                   if (valtoset>0)
                   {
                       if (nii.data[currentIndex] == 0)
                       {
                           changedPoints.push(currentIndex);
                           nii.data[currentIndex] = valtoset;
                       }
                   }
                   else
                   {
                       if (nii.data[currentIndex] > 0)
                       {
                           changedPoints.push(currentIndex);
                           nii.data[currentIndex] = valtoset;
                       }
                   }
                }
            }
            else
            {
                if (nii.data[currentIndex] == 0 | nii.data[currentIndex] == 2 )
                {
                    changedPoints.push(currentIndex);
                    nii.data[currentIndex] = valtoset;
                }
            }
        }

       // if (master.mainViewPort != -1)
       //     points_wc = math.multiply(math.inv(master.reorientationMatrix.matrix), points_wc);

        // function can also be called from outside as "standalone" to modify an abstract roi
        // in this case, all necessary variables must be set in "params"
        // therefore, must use a local that_ and pencil_ here
        if( params == undefined )
        {
            var nii = medViewer.currentROI.content;
            var that_ = that;
            var max_extent_perc = medViewer.computeMaxExtentFac() / 300;
        }
        else
        {
            var that_ = params;
            var nii  = that_.nii;
            slicing = medViewer.getSlicingDimOfArray();
            // required fields are
            /*
            that.pencil
            that.smartpaw;
            that.threspen;
            that.regionGrow ;
            that.regionGrowRestric;
            */

            // why is this not 1 in some cases???? radius will be wrong then
            var max_extent_perc = 1;

        }

        var pencil_ = that_.pencil;


        var nii_ondraw = medViewer.nii;

        slicing = applyInvPerm(nii.permutationOrder, nii_ondraw.permutationOrder[slicing]);

        var p = [0,1,2];
        var radiusx = math.floor(((slicing == p[0]) ? pencil_.radius_z : pencil_.radius) / nii.voxSize[p[0]] * max_extent_perc);
        var radiusy = math.floor(((slicing == p[1]) ? pencil_.radius_z : pencil_.radius) / nii.voxSize[p[1]] * max_extent_perc);
        var radiusz = math.floor(((slicing == p[2]) ? pencil_.radius_z : pencil_.radius) / nii.voxSize[p[2]] * max_extent_perc);
        var sx2 = nii.voxSize[p[0]] * nii.voxSize[p[0]] / max_extent_perc / max_extent_perc;
        var sy2 = nii.voxSize[p[1]] * nii.voxSize[p[1]] / max_extent_perc / max_extent_perc;
        var sz2 = nii.voxSize[p[2]] * nii.voxSize[p[2]] / max_extent_perc / max_extent_perc;



        // calculate vectors in plane to draw
        var ie = math.inv(nii.edges);
        var rectilinear = true;
        var R =  (medViewer.getTiltMat(slicing));

        if (KViewer.mainViewport != -1) // && !isIdentity(R))
            rectilinear = false;


        if (KViewer.navigationMode == 0 || KViewer.mainViewport == -1 )
        {
            var U =  math.multiply(math.inv(nii.edges),nii_ondraw.edges);
            var iee = math.multiply(math.multiply(U,R),math.inv(U));
        }
        else
        {
            var W = (KViewer.reorientationMatrix.matrix);
            var iee = math.multiply(math.multiply(math.inv(nii.edges),W),nii.edges);
        }
        var vx = math.multiply(iee,  [1,0,0,0])._data;
        var vy = math.multiply(iee,  [0,1,0,0])._data;
        var vz = math.multiply(iee,  [0,0,1,0])._data;


        var points = math.multiply(ie, points_wc)._data;
        points[0] = Math.round(points[0])
        points[1] = Math.round(points[1])
        points[2] = Math.round(points[2])

        var radiusx_up = radiusx;
        var radiusx_down = radiusx;
        if (radiusx_up >= nii.sizes[0]-points[0])
            radiusx_up = nii.sizes[0]-points[0]-1;
        if (points[0]-radiusx_down <= 0 )
            radiusx_down = points[0];

        var radiusy_up = radiusy;
        var radiusy_down = radiusy;
        if (radiusy_up >= nii.sizes[1]-points[1])
            radiusy_up = nii.sizes[1]-points[1]-1;
        if (points[1]-radiusy_down <= 0 )
            radiusy_down = points[1];

        var radiusz_up = radiusz;
        var radiusz_down = radiusz;
        if (radiusz_up >= nii.sizes[2]-points[2])
            radiusz_up = nii.sizes[2]-points[2]-1;
        if (points[2]-radiusz_down <= 0 )
            radiusz_down = points[2];


        // prepare vars for our own in line add (math add is very slow)
        var currentVoxel = [0, 0, 0];
        var currentIndex = 0;

        var sigma = math.abs(medViewer.histoManager.clim[1] - medViewer.histoManager.clim[0]);

        // for the history
        var changedPoints = [];


        var dx = rectilinear?1:0.5;
        var dy = rectilinear?1:0.5;
        var dz = rectilinear?1:0.5;

        // mode4D
        /*
        if(medViewer.nii.numTimePoints != nii.numTimePoints)
        {
            // must resize the nii to have correct number of dimensions ??
            // or at least alert?
        }
        */

        var current_t_contrast = 0;
        if (medViewer.nii.numTimePoints > 1)
            current_t_contrast = medViewer.nii.currentTimePoint.t;
        else
            if (nii.numTimePoints > 1)
                current_t_contrast =  nii.currentTimePoint.t;


        var currentTimePoint = current_t_contrast;
        if (currentTimePoint > nii.numTimePoints-1)
            currentTimePoint = nii.numTimePoints-1;


        if (medViewer.currentROI && medViewer.currentROI.fileinfo && medViewer.currentROI.fileinfo.surfreference)
        {
            if (medViewer.currentROI.fileinfo.surfreference.changed == undefined)
            {
                medViewer.currentROI.fileinfo.surfreference.changed = {}
            }
            medViewer.currentROI.fileinfo.surfreference.changed[currentTimePoint] = true;
        }
            



        // take thres from clim if desired
        var thres = ["off","off"]
        if (pencil_.thres_high != undefined && pencil_.thres_high != "off")
        {
            if (pencil_.thres_high == "climL" )
                thres[1] = medViewer.histoManager.clim[0];
            else if(pencil_.thres_high == "climR" )
                thres[1] = medViewer.histoManager.clim[1];
            else 
                thres[1] = medViewer.niiOriginal.datascaling.ie(pencil_.thres_high);
        }

        if (pencil_.thres_low != undefined && pencil_.thres_low != "off")
        {
            if (pencil_.thres_low == "climL" )
                thres[0] = medViewer.histoManager.clim[0];
            else if(pencil_.thres_low == "climR" )
                thres[0] = medViewer.histoManager.clim[1];
            else 
                thres[0] = medViewer.niiOriginal.datascaling.ie(pencil_.thres_low);
        }

        var comp = function () { return true}
        if (that_.threspen > 0)
        {
             if (thres[0] == "off" & thres[1] != "off")
                comp = function(x) { return x < thres[1]}
             if (thres[0] != "off" & thres[1] == "off")
                comp = function(x) { return x > thres[0]}
             if (thres[0] != "off" & thres[1] != "off")
                comp = function(x) { return x > thres[0] & x < thres[1]}
        }

        // always delete all on right click with threspen, therefore here also != 0
        if (  ( that_.smartpaw | ( that_.threspen > 0 & !(that_.regionGrowRestric | that_.regionGrow) & valtoset != 0 ) ) )
        {


            var t = 1;
            if (medViewer.nii.sizes.length > 3)
                t = medViewer.nii.sizes[3];
            var whd = medViewer.nii.sizes[0] * medViewer.nii.sizes[1] * medViewer.nii.sizes[2];



            var ie_im = math.multiply(math.inv(medViewer.niiOriginal.edges),nii.edges);
            var vx_im = math.multiply(ie_im, vx)._data;
            var vy_im = math.multiply(ie_im, vy)._data;
            var vz_im = math.multiply(ie_im, vz)._data;
            points_im = math.multiply(math.inv(medViewer.niiOriginal.edges), points_wc)._data;

            var currentVoxel_im = (math.round(points_im));
            var offset_im = medViewer.niiOriginal.sizes[0] * medViewer.niiOriginal.sizes[1] * medViewer.niiOriginal.sizes[2] * current_t_contrast ;
            var currentIndex_im = offset_im + medViewer.niiOriginal.sizes[0] * medViewer.niiOriginal.sizes[1] * currentVoxel_im[2] + currentVoxel_im[1] * medViewer.niiOriginal.sizes[0] + currentVoxel_im[0];

            var centerval = medViewer.niiOriginal.data[currentIndex_im];       
            function grayValdif(currentIndex_im)
            {
                return math.abs(medViewer.niiOriginal.data[currentIndex_im] - centerval) / sigma;            
            }


            for (var z = -radiusz_down; z <= radiusz_up; z+=dz)
                for (var x = -radiusx_down; x <= radiusx_up; x+=dx)
                    for (var y = -radiusy_down; y <= radiusy_up; y+=dy)
                    {
                        var d2 = x * x * sx2 + y * y * sy2 + z * z * sz2;
                        if (d2 <= pencil_.radius * pencil_.radius)
                        {
                            currentVoxel[0] = Math.round(points[0] + x * vx[0] + y * vy[0] + z * vz[0]);
                            currentVoxel[1] = Math.round(points[1] + x * vx[1] + y * vy[1] + z * vz[1]);
                            currentVoxel[2] = Math.round(points[2] + x * vx[2] + y * vy[2] + z * vz[2]);

                            currentVoxel_im[0] = Math.round(points_im[0] + x * vx_im[0] + y * vy_im[0] + z * vz_im[0]);
                            currentVoxel_im[1] = Math.round(points_im[1] + x * vx_im[1] + y * vy_im[1] + z * vz_im[1]);
                            currentVoxel_im[2] = Math.round(points_im[2] + x * vx_im[2] + y * vy_im[2] + z * vz_im[2]);

                            currentIndex = nii.sizes[0] * nii.sizes[1] * currentVoxel[2] + currentVoxel[1] * nii.sizes[0] + currentVoxel[0] + nii.widheidep*(currentTimePoint);

                            currentIndex_im = offset_im+ medViewer.niiOriginal.sizes[0] * medViewer.niiOriginal.sizes[1] * currentVoxel_im[2] + currentVoxel_im[1] * medViewer.niiOriginal.sizes[0] + currentVoxel_im[0];

                            if (that_.smartpaw)
                            {
                                if (grayValdif(currentIndex_im) + d2 / (pencil_.radius * pencil_.radius) * 0.1 < 0.2 &
                                (!(that_.threspen == 1 | that_.threspen == 3) | centerval > thres) &
                                (!(that_.threspen == 2 | that_.threspen == 4) | centerval < thres))
                                {
                                    updateVal(valtoset,currentIndex);
                                }
                            }
                            else if (that_.threspen == 1)
                            {
                                if (comp(medViewer.niiOriginal.data[currentIndex_im]))
                                    updateVal(valtoset,currentIndex);
                            }
                        }
                    }

        }
        else if ( valtoset != 0 && (that_.regionGrow | that_.regionGrowRestric) )
        {

            currentVoxel[0] = Math.round(points[0]);
            currentVoxel[1] = Math.round(points[1]);
            currentVoxel[2] = Math.round(points[2]);

            currentIndex = nii.sizes[0] * nii.sizes[1] * currentVoxel[2] + currentVoxel[1] * nii.sizes[0] + currentVoxel[0] + nii.widheidep*(currentTimePoint);;

            var B;
            if (KViewer.navigationMode == 0 || KViewer.mainViewport == -1 )
              B = math.multiply(math.inv(medViewer.niiOriginal.edges),nii.edges)._data;
            else
              B = math.multiply(math.multiply(math.inv(medViewer.niiOriginal.edges),math.inv(KViewer.reorientationMatrix.matrix)),nii.edges)._data;
            var A = math.multiply(math.inv(medViewer.niiOriginal.edges),nii.edges)._data;

            // if threspen is enabled, take these (hard) clims, otherwise take histogram clims
            if(that_.threspen !== 0)
            {

               var clims = {}; 
               if (thres[0] != "off") 
                   clims.threshold_higher = thres[0];
               if (thres[1] != "off") 
                   clims.threshold_lower = thres[1];
            }
            else
            {
                var clims = medViewer.histoManager.clim;
            }

            var rv = [nii.voxSize[0]/nii_ondraw.voxSize[0],nii.voxSize[1]/nii_ondraw.voxSize[1],nii.voxSize[2]/nii_ondraw.voxSize[2]]

            var roidata

            if (nii.numTimePoints > currentTimePoint)
               roidata = new Uint8Array(nii.data.buffer,nii.hdroffset+currentTimePoint*nii.widheidep);
            else
               roidata = new Uint8Array(nii.data.buffer,nii.hdroffset);

            if (current_t_contrast >= medViewer.niiOriginal.numTimePoints)
                current_t_contrast=0;

            regionGrow(medViewer.niiOriginal,roidata,A,B,nii.sizes, currentVoxel, valtoset,
                    clims, that_.regionGrowRestric,
                    radiusx*rv[0],radiusy*rv[1],radiusz*rv[2],
                    sx2/(rv[0]*rv[0]), sy2/(rv[1]*rv[1]), sz2/(rv[2]*rv[2]), pencil_.radius * pencil_.radius, callback, current_t_contrast);



            return;

        }
        else
        {
            var dx = rectilinear?1:0.5;
            var dy = rectilinear?1:0.5;
            var dz = rectilinear?1:0.5;
            for (var z = -radiusz_down; z <= radiusz_up; z+=dz)
                for (var x = -radiusx_down; x <= radiusx_up; x+=dx)
                    for (var y = -radiusy_down; y <= radiusy_up; y+=dy)
                        if (x * x * sx2 + y * y * sy2 + z * z * sz2 <= pencil_.radius * pencil_.radius)
                        {

                            currentVoxel[0] = Math.round(points[0] + x * vx[0] + y * vy[0] + z * vz[0]);
                            currentVoxel[1] = Math.round(points[1] + x * vx[1] + y * vy[1] + z * vz[1]);
                            currentVoxel[2] = Math.round(points[2] + x * vx[2] + y * vy[2] + z * vz[2]);

                            currentIndex = nii.sizes[0] * nii.sizes[1] * currentVoxel[2] + currentVoxel[1] * nii.sizes[0] + currentVoxel[0] + nii.widheidep*(currentTimePoint);

                            updateVal(valtoset,currentIndex);
                        }
        }

        callback(changedPoints);


    }


    /***************************************************************************************
     * History
    ****************************************************************************************/
    /** the history for undo/redo capabilities */
    that.history = {};
    
    that.history.current = 0;
    that.history.globalsteps = [];
    that.history.maxSteps = 10;

    // control + z: undo
    // control + shift + z: redo
    document.addEventListener("keydown", function(evt)
    {
        evt = evt || window.event;

        if ($(evt.target).is("textarea") || $(evt.target).is("input"))
            return;
        if ((evt.which == 90 || evt.keyCode == 90) && evt.ctrlKey && !evt.shiftKey)
        {
            that.history.goto(1);
            evt.preventDefault();evt.stopPropagation();return false;

        }
        else if ((evt.which == 90 || evt.keyCode == 90) && evt.ctrlKey && evt.shiftKey)
        {
            that.history.goto(-1);
            evt.preventDefault();evt.stopPropagation();return false;
        }
    });


    that.history.record = function(job, medViewer,whichROI,operation_type)
    {
        if (whichROI == undefined)
            whichROI = currentROI;

        if (whichROI == undefined || whichROI.content == undefined)
            return;

        whichROI.modified = true;

        if (operation_type == 'use_as_last')
             that.history.lastROImodified = whichROI;
        else if (operation_type != 'keep_last')
            that.history.lastROImodified = undefined;


        that.history.medViewer = medViewer;
        if (job === "startRecording")
        {
            if (whichROI.content.history === undefined)
            {
                whichROI.content.history = {
                    steps: [],
                    current: 0
                };
            }

            var h = whichROI.content.history;
            // set current pos to zero and delete significat rest
            h.steps = h.steps.splice(h.current, that.history.maxSteps);                         
            h.current = 0;

            if (operation_type == undefined || operation_type != "dontaddtoglobal")
            {

            that.history.globalsteps = that.history.globalsteps.splice(that.history.current, that.history.maxSteps);
            that.history.current = 0;


            // insert a new step at the beginning
            that.history.globalsteps.unshift(whichROI);

            }

            h.steps.unshift({
                data: new Uint32Array(10000),
                valtoset: false,
                actualLength: 0
            });


        }
        if (job === "stopRecording")
        {

        }

    }


    that.history.add = function(data, valtoset,whichROI)
    {

        if (whichROI == undefined)
            whichROI = currentROI;

        if (data == undefined || data.length == 0)
            return

        if (whichROI == undefined || (whichROI.content && whichROI.content.history == undefined))
            return;

        //var h = that.history.whichROI.content.history.steps[that.history.whichROI.content.history.current];
        var h = whichROI.content.history.steps[whichROI.content.history.current];
        h.actualLength += data.length;
        h.others = data.others;
        data.others = undefined;

        // must enlarge the array, take at least 10000 points
        if (h.data.length <= h.actualLength)
        {
            //console.log('ROI history: enlargin buffer for this step.');
            var tmp = new Uint32Array(h.data.length + math.max(10000, data.length));
            tmp.set(h.data, 0);
            tmp.set(data, h.actualLength - data.length);
            h.data = tmp;
        }
        else
        {
            h.data.set(data, h.actualLength - data.length);
        }

        if (whichROI.content.onVoxels)
        {
            if (valtoset > 0)
            {
                for (var k = 0; k < data.length;k++)
                    whichROI.content.onVoxels[data[k]] = 1;
            }
            else
            {
                for (var k = 0; k < data.length;k++)
                    if (whichROI.content.onVoxels[data[k]])
                        whichROI.content.onVoxels[data[k]] = undefined;
            }

        }

        if (whichROI.ccanalysis)
            whichROI.ccanalysis.update();


        if (whichROI.fileinfo && whichROI.fileinfo.surfreference)
        {
            if (whichROI.fileinfo.surfreference.changed == undefined)
                whichROI.fileinfo.surfreference.changed = {}
            if (whichROI.content.currentTimePoint)                
                whichROI.fileinfo.surfreference.changed[whichROI.content.currentTimePoint.t] = true;
        }
            


        h.valtoset = valtoset;
    }


    that.history.goto = function(step,whichROI)
    {
        var h = that.history;

        if (h.current + step > h.globalsteps.length | h.current + step < 0)
            return;

        if (step === -1)
            h.current += step;
        
        if (whichROI == undefined)
           whichROI = h.globalsteps[h.current];

        that.history.goto_single(step,whichROI)

        if (step === 1)
            h.current += step;


    }

    that.history.goto_single = function(step,whichROI)
    {

        whichROI = whichROI || that.history.lastROImodified || currentROI;

        // step = plus means go BACK in time
        if (whichROI==undefined || whichROI.content == undefined || whichROI.content.history == undefined)
            return;

        var h = whichROI.content.history;

        if (h.current + step > h.steps.length | h.current + step < 0)
            return;

        if (step === -1)
            // go one step in redo-direction of possible
            h.current += step;

        var thisstep = h.steps[h.current];

        that.history.applyChange(thisstep.data, thisstep.actualLength,whichROI);

        if (step === 1)
            // if backward, increment AFTER
            h.current += step;

        update3D(whichROI);

        signalhandler.send("updateImage",{id:whichROI.fileID});

        if (thisstep.others != undefined)
            {
                for (var k = 0; k < thisstep.others.length;k++)
                {
                     that.history.goto_single(step,thisstep.others[k]);
                }
            }
       that.history.lastROImodified = undefined;



    }

    that.history.initOnVoxels = function(roi)
    {
        var onvox = {};
        for (var z = 0; z < roi.sizes[2]; z++)
            for (var y = 0; y < roi.sizes[1]; y++)
                for (var x = 0; x < roi.sizes[0]; x++)
                {
                    var idx = roi.sizes[0] * roi.sizes[1] * z + roi.sizes[0] * y + x;
                    if (roi.data[idx] > 0.5)
                        onvox[idx] = 1;
                }

        return onvox;
    }


    that.history.applyChange = function(data, actualLength,whichROI)
    {


        if (whichROI == undefined)
            whichROI = currentROI;


        if (actualLength == undefined)
            actualLength = data.length;
        var nii = whichROI.content;

        if (whichROI.content.onVoxels)
        {
            for (var k = 0; k < actualLength; k++)
            {
                if (nii.data[data[k]] > 0)
                {
                    nii.data[data[k]] = 0;
                    whichROI.content.onVoxels[data[k]] = undefined;
                }
                else
                {
                    nii.data[data[k]] = 1;
                    whichROI.content.onVoxels[data[k]] = 1;
                }
            }
        }
        else
        {
            for (var k = 0; k < actualLength; k++)
            {
                if (nii.data[data[k]] > 0)
                    nii.data[data[k]] = 0;
                else
                    nii.data[data[k]] = 1;
            }
        }
        if (whichROI.ccanalysis)
            whichROI.ccanalysis.update();



    }





    /***************************************************************************************
     * computing the bbox of a ROI
     ****************************************************************************************/

    function computeBBox(roi)
    {
        var max = [-100000, -100000, -100000];
        var min = [100000, 100000, 100000];

        var edges = roi.content.edges;
        var sz = roi.content.sizes;
        for (var z = 0; z < sz[2]; z++)
            for (var y = 0; y < sz[1]; y++)
                for (var x = 0; x < sz[0]; x++)
                {
                    if (roi.content.data[sz[0] * sz[1] * z + sz[0] * y + x] > 0.5)
                    {
                        var p = math.multiply(edges, [x, y, z, 1]);
                        if (max[0] < p._data[0])
                            max[0] = p._data[0];
                        if (min[0] > p._data[0])
                            min[0] = p._data[0];
                        if (max[1] < p._data[1])
                            max[1] = p._data[1];
                        if (min[1] > p._data[1])
                            min[1] = p._data[1];
                        if (max[2] < p._data[2])
                            max[2] = p._data[2];
                        if (min[2] > p._data[2])
                            min[2] = p._data[2];
                    }
                }

        roi.bbox = {
            max: max,
            min: min
        };



    }
    that.computeBBox = computeBBox;



    /***************************************************************************************
    * set current position to center of ROI
    ****************************************************************************************/

    function set_to_center(roi)
    {
        var cx = 0;
        var cy = 0;
        var cz = 0;
        var cnt = 0;
        for (var z = 0; z < roi.sizes[2]; z++)
            for (var y = 0; y < roi.sizes[1]; y++)
                for (var x = 0; x < roi.sizes[0]; x++)
                {
                    if (roi.data[roi.sizes[0] * roi.sizes[1] * z + roi.sizes[0] * y + x] > 0.5)
                    {
                        cx += x;
                        cy += y;
                        cz += z;
                        cnt++;
                    }
                }
        cx /= cnt;
        cy /= cnt;
        cz /= cnt;
        if (cnt > 0)
        {
            var p = math.multiply(roi.edges, [cx, cy, cz, 1]);
            master.currentPoint = p;
            signalhandler.send("positionChange",{point:p});
        }
    }




      function contextPicker(ev,viewer)
      {
          var point = viewer.getRealWorldCoordinatesFromMouseEvent(ev.clientX,ev.clientY);


          var R;
          if (KViewer.navigationMode == 0 | KViewer.navigationMode == 2 )
             R = math.diag([1, 1, 1, 1]);
          else
            R = getTiltMat(slicingDimOfArray);
          if (master.mainViewport !== -1)
              point = math.multiply(math.inv(KViewer.reorientationMatrix.matrix), point);
          var curV = math.multiply(math.inv(viewer.nii.edges), point);
          var reorient = math.diag([1, 1, 1, 1]);


          var fobj;
          var conncomp_label;
          for (var k = 0; k < viewer.ROIs.length;k++)
          {
              if (!viewer.ROIs[k].visible)
                  continue;
              var roi = viewer.ROIs[k].roi;
              if (KViewer.navigationTool.isinstance &&
                   ((KViewer.navigationTool.movingObjs[roi.fileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ) )
                    reorient = KViewer.reorientationMatrix.matrix;
              var A = (math.multiply(math.multiply(math.multiply(math.inv(roi.content.edges), reorient), viewer.nii.edges), R))._data;
              var offs = 0;
              if (roi.content.currentTimePoint != undefined)
                   offs = roi.content.currentTimePoint.t*roi.content.widheidep
              var roi_val =  NNInterp(roi.content, curV._data[0], curV._data[1], curV._data[2], A, offs)
              if (roi_val >0.5)
              {
                    fobj = roi;
                    if (fobj.ccanalysis && fobj.ccanalysis.enabled)
                    {
                        var ii  = NNInterp({data:fobj.ccanalysis.cc.labels,wid:roi.content.wid,widhei:roi.content.widhei
                                            ,widheidep:roi.content.widheidep,sizes:roi.content.sizes},
                                             curV._data[0], curV._data[1], curV._data[2], A, offs);
                        for (var j = 0; j < fobj.ccanalysis.persistent.length;j++)
                            if (fobj.ccanalysis.persistent[j].idx == ii)
                            {
                                conncomp_label = fobj.ccanalysis.persistent[j];
                                break;
                            }

                    }
                    break;
              }
          }

          if (fobj == undefined)
          {
               return false;
          }
          else
          {
              contextMenuLabel(fobj,conncomp_label,point,ev)
              return true;

          }
      }

      function contextMenuLabel(fobj,conncomp_label,point,ev)
      {

          var labels;
          if (KViewer.predefinedROIlabels != undefined)
            labels = KViewer.predefinedROIlabels;
          else
          {
                labels = [];
                for (var k in KViewer.roiTool.ROIs)
                  if (KViewer.roiTool.ROIs[k].fileID != fobj.fileID)
                    labels.push({name:KViewer.roiTool.ROIs[k].filename,color:KViewer.roiTool.ROIs[k].color,id:KViewer.roiTool.ROIs[k].fileID});

          }


          KContextMenu(
            function()
            {
                var mediaire = false;
                var $menu = $("<ul class='menu_context'>");

                if (conncomp_label & !mediaire)
                    $menu.append($("<li class='inactive'>crop label "+fobj.filename +"/"+ conncomp_label.name +" to...&nbsp</li>"));
                else
                    $menu.append($("<li class='inactive'>move "+that.conncompdesc+" to...&nbsp </li>"));


                if (labels.length == 0)
                {
                    if (!mediaire)
                        $menu.append($("<span> &nbsp no other ROIs ... </span>"));
                }
                else
                {
                    for (var k = 0; k < labels.length;k++)
                    {
						if(labels[k].name ==  fobj.filename || (conncomp_label != undefined && labels[k].name == conncomp_label.name))
							continue
                        
                        if(labels[k].color!=undefined)
                        {
                            var c = colors[labels[k].color];
                            var chtml = "background:" +RGB2HTML(c[0], c[1], c[2])
                        }
                        else
                            chtml = "";
                        var colordiv = "<span  class='color_selector_virtual' style='" + chtml + "'></span>"
                        $menu.append($("<li onchoice='addto"+k+"'>  "+ colordiv + labels[k].name+ " </li>"));
                    }
                }
               $menu.append($("<li  onchoice='addto'><span  class='color_selector_virtual' style='background:white;'></span>... new mask </li>"));
               $menu.append($("<hr width='99%'> "));
               
               $menu.append($("<li onchoice='keep'><i class='leftaligned fa fa-square'></i>keep "+that.conncompdesc+"</li>"));
               $menu.append($("<li onchoice='delete'><i class='leftaligned fa fa-trash'></i>delete "+that.conncompdesc+"</li>"));
               if (fobj.content.numTimePoints > 1)
               {
                  $menu.append($("<li onchoice='keep4D'><i class='leftaligned fa fa-square'></i>keep "+that.conncompdesc+" (4D)</li>"));
                  $menu.append($("<li onchoice='delete4D'><i class='leftaligned fa fa-trash'></i>delete "+that.conncompdesc+" (4D)</li>"));
               }

               if (currentROI != fobj)
                    $menu.append($("<li onchoice='edit'><i class='leftaligned fa fa-pencil'></i>edit "+that.conncompdesc+"</li>"));


                return $menu;
            },
            function(str, ev2)
            {
                if (point == undefined)
                    point = math.multiply(fobj.content.edges, [conncomp_label.cog[0],conncomp_label.cog[1],conncomp_label.cog[2],1]);

                if (str == undefined)
                    return;
                  else if (str.substring(0,5) == "addto")
                        {
                            var l = parseInt(str.substring(5)); // will b NaN for new roi
                            var roiid;
                            var color;

                            // found an existing ROI, or a predefined label
                            if (labels[l] != undefined)
                            {
                                if (labels[l].id != undefined)
                                    roiid = labels[l].id;
                                else
                                    roiid = labels[l].name;
                                var intendedName =  labels[l].name;
                                // choose the
                                var color = labels[l].color;
                            }
                            else
                            {
                                var intendedName = KViewer.dataManager.getNextIteratedFilename( fobj.filename + "_c" );
                            }

                            // if no color specified, choose next available
                            if(color==undefined)
                            {
                                if (that.last_created_roicolor == undefined)
                                    if (fobj.color != undefined)                               
                                        that.last_created_roicolor  = fobj.color;
                                    else
                                        that.last_created_roicolor  = 0
                                color = (++that.last_created_roicolor) % KColor.list.length
                            }

							if(roiid==undefined)
							   roiid = 'ROI_' + intendedName
							// try to get files

							var nfobj = KViewer.dataManager.getFile(roiid);

                            if(nfobj==undefined)
                            {
                                fobj.intendedROIid = roiid;
                                nfobj = KViewer.dataManager.cloneAsROI(fobj.fileID,intendedName)[0];
                                nfobj.color=color;
                                KViewer.roiTool.ROIs[nfobj.fileID] = nfobj;
                                KViewer.roiTool.update();
                            }

                            // this does the actual cropping
                            var cp = cropConnectedComponent2(fobj,nfobj, point)

                            // keep cclabels up to date
                            if (conncomp_label && fobj.ccanalysis)
                            {
                                for (var k = 0;k <fobj.ccanalysis.persistent.length;k++)
                                {
                                    if (conncomp_label == fobj.ccanalysis.persistent[k])
                                    {
                                        fobj.ccanalysis.persistent.splice(k,1);
                                        break;
                                    }
                                }
                                if (nfobj.ccanalysis)
                                    nfobj.ccanalysis.persistent.push(conncomp_label);
                            }


                            // if ROI not yet present put into viewer
                            setContentwithROI(nfobj,{intent:{ROI:true,color:color}},fobj.fileID);
                            signalhandler.send("updateImage",{id: nfobj.fileID});


                            // update history
                            cp.others = [nfobj];
                            KViewer.roiTool.history.record('startRecording',  that.roiPanel.getParentViewer(),fobj, 'use_as_last');
                            KViewer.roiTool.history.add(cp, 1,fobj);
                            KViewer.roiTool.history.record('startRecording',  that.roiPanel.getParentViewer(),nfobj, 'dontaddtoglobal');
                            KViewer.roiTool.history.add(cp, 1,nfobj);


                        }

                  else if (str == "delete")
                        {
                            that.delROI_component(fobj, point)
                        }
                  else if (str == "delete4D")
                        {
                            that.delROI_component(fobj, point,'all')
                        }
                  else if (str == "keep")
                        {
                            that.keepROI_component(fobj, point)
                        }
                  else if (str == "keep4D")
                        {
                            that.keepROI_component(fobj, point,'all')
                        }

                  else if (str == "edit")
                        {

                            that.makeCurrentGlobal(fobj.fileID)

                        }


                  function setContentwithROI(f,intent,fid)
                  {
                        KViewer.iterateMedViewers(function(viewer)
                        {
                            for (var k = 0 ; k < viewer.ROIs.length;k++)
                            {
                                    if (viewer.ROIs[k].roi.fileID == fid)
                                    {
                                        viewer.setContent(f,intent);
                                    }
                            }

                        });
                  }
            },true,false,true,false)(ev)

            return true;
      }

    that.contextPicker = contextPicker;





    function hidePen(medViewer)
    {

        that.enabled = false;
        that.$pencil.hide();
        medViewer.$canvas.css('cursor', 'default');
    };
    that.hidePen = hidePen;

    function hidePenGlobal()
    {
        KViewer.iterateMedViewers(function(viewer)
        {
            KViewer.roiTool.hidePen(viewer);
        });
    }
    that.hidePenGlobal = hidePenGlobal;


    /***************************************************************************************
    * pen representation in 2D-viewers
    ****************************************************************************************/
    function drawPen(ev, medViewer)
    {
        if ( medViewer.currentROI != undefined && (that.penEnabled & !that.polyEnabled && ( $(ev.target).hasClass("KViewPort_canvas") )))
        {

            var max_extent_perc = medViewer.computeMaxExtentFac() / 300
            var fac = medViewer.embedrelfac * medViewer.zoomFac;
            var r = (2 * (pencil.radius)) * fac * max_extent_perc;

            that.$pencil.show();
            that.enabled = true;
            medViewer.$canvas.css('cursor', 'none');

            if (that.regionGrow)
            {
                that.$pencil.addClass("regionGrow");
                r = 50;
            }
            else
                that.$pencil.removeClass("regionGrow");


            var left = window.pageXOffset+ev.clientX - r / 2 - 1;
            var top = window.pageYOffset+ev.clientY - r / 2 - 1;


            that.$pencil.offset({
                left: left,
                top: top
            });

            that.$pencil.css({
                left: left,
                top: top,
                width: r,
                height: r
            });
            return true;
        }
        else
        {
            that.enabled = false;
            that.$pencil.hide();
            medViewer.$canvas.css('cursor', 'default');
            return false;
        }


    }
    that.drawPen = drawPen;




    /***************************************************************************************
    * tools for dynamic context manu based on passing the roi id
   ****************************************************************************************/

    var roitools_contextmenu = function() {
        var $menu = $("<ul class='menu_context'>");
        $menu.append($("<li onchoice='invert'> invert  </li>"));
        $menu.append($("<li onchoice='clear'> clear  </li>"));
        $menu.append($("<hr>"));
        $menu.append($("<li onchoice='fillholes'> fill holes  </li>"));
        var thres = removesalt.threshold;
        var $salt_threshold = $("<input onchoice='preventSelection' type='number' step='5' min='2' max='10000'>").val(thres).
             on('keyup', function(ev) {
            var $input = $(ev.target);
            removesalt.threshold = $input.val();
           });
        $menu.append($("<li onchoice='removesalt'> remove salt </li>").append($salt_threshold));
        $menu.append($("<li onchoice='splatter'> splatter </li>"));
        if (KViewer.currentPoint != undefined)
        {
            var str = "("+KViewer.currentPoint._data[0].toFixed(0)+","+KViewer.currentPoint._data[1].toFixed(0)+","+KViewer.currentPoint._data[2].toFixed(0)+")"
            $menu.append($("<li onchoice='crop'> crop at seed "+str+" </li>"));
        }
        $menu.append($("<hr>"));
        $menu.append($("<li onchoice='opening'> opening  </li>"));
        $menu.append($("<li onchoice='closing'> closing  </li>"));
        $menu.append($("<li onchoice='erode'> erode  </li>"));
        $menu.append($("<li onchoice='dilate'> dilate  </li>"));
        $menu.append($("<li onchoice='mirror' class='mirror_roi_dimspan'> mirror  <span dim='X'>LR</span> <span dim='Y'>AP</span> <span dim='Z'>Z</span> <span dim='C'>custom</span></li>"));
        $menu.append($("<hr>"));
        $menu.append($("<li onchoice='threshold_upper'> upper threshold  </li>"));
        $menu.append($("<li onchoice='threshold_lower'> lower threshold </li>"));
        return $menu;
    }




    that.tools_contextmenu_dynamic = function(ev, id) {
        new KContextMenu(roitools_contextmenu,function(id) {
            return function(str, ev) {
                tools(str, ev, id)
            }
        }(id))(ev, id)
    }
    ;



    /***************************************************************************************
    * create ROI subview
    ****************************************************************************************/
    /** creates a view of the ROI in a medviewer
	 * @param {object} fobj - the fileObject of the ROI
	 * @param {object} viewer - the medviewer (see {@link KMedViewer})
	 * @param {object} intent - intention like color
	 */
    that.createView = function(fobj, viewer, intent)
    {
        var obj = {
            type: "roi",
            roi: fobj,
            nii: fobj.content,
            isCurrent: fobj == currentROI,
            //color:(viewer.ROIs.length) % colors.length,
            color: fobj.color,
            visible: true
        };


        obj.color = Object.getOwnPropertyNames(ROIs).length % colors.length;
        if (intent != undefined & intent.color != undefined)
        {
            obj.color = intent.color;
            fobj.color = intent.color; // overwrite color with intent color
        }

        // color contextmenu
        obj.$colselector = KColorSelector(colors,
        function(c) {
            return "background:" + RGB2HTML(c[0], c[1], c[2]) + ";";
        },
        function() {
            if (obj.refSurfView != undefined)
            {
                obj.refSurfView.color = obj.color;
                viewer.gl.setSurfColor(obj.refSurfView);
            }
            viewer.drawSlice({
                mosaicdraw: true
            });

        }, obj);



        // tools contextmenu
        var tools_contextmenu = new KContextMenu(roitools_contextmenu,
        function(fobj) {
            return function(str, ev) {
                tools(str, ev, fobj.fileID,viewer)
            }
        }(fobj));

        /***************************************************************************************
        * the subviews toolbar
        ****************************************************************************************/
        var $captiondiv, $cutdiv, $currentpickerdiv, $dragdiv,$wrench,$createOutlines, $toggleVisible;


        obj.divs = [
            $("<br style='clear:both' />"),
            $("<div  class='KViewPort_tool persistent roi'>  <i class='fa fa-close fa-1x'></i></div>").appendTooltip("closeROI")
            .click(close).mousedown(viewer.viewport.closeContextMenu(obj)),
            $("<div  class='KViewPort_tool roi'>  <i class='fa fa-save fa-1x'></i></div>").appendTooltip("saveuploadROI")
            .click(function() {
                saveROI(obj.roi)
            }),
            $("<div  class='KViewPort_tool roi'> <i class='fa  fa-binoculars'></i></div> ").appendTooltip("jumptoROI")
            .click(function(roi) {
                return function() {
                    set_to_center(roi.content);
                }
            }(obj.roi)),
            $createOutlines = $("<div  class='KViewPort_tool roi'>  <i class='fa fa-1x fa-lemon-o'></i></div>").appendTooltip("outline"),
            $createIso = $("<div  class='KViewPort_tool roi'>  <i class='fa fa-1x'>3D</i></div>").appendTooltip("isosurfROI"),
            $wrench = $("<div  class='KViewPort_tool roi'>  <i class='fa fa-wrench fa-1x'></i></div>").click(tools_contextmenu).appendTooltip("roitools"),
            $toggleVisible = $("<div  class='KViewPort_tool roi '>").append($("<i class='fa fa-eye fa-1x'></i></div>").appendTooltip("showhide"))
            .click(function(e){obj.toggle(e)}),
            $currentpickerdiv = $("<div  class='KViewPort_tool roi '>  <i class='currentFiberset fa fa-pencil-square-o fa-1x'></i></div>").appendTooltip("makecurrent")
            .click(makeCurrent),

            $captiondiv = $("<div  class='KViewPort_tool roi caption'> " + obj.roi.filename + "</div>"),
            obj.$colselector.appendTooltip("selectcolor"),
            $dragdiv = $("<div  class='KViewPort_tool  draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>").appendTooltip("dragdropviewport"),
        ];

        if(obj.nii.numTimePoints > 1)
        {
            var $timesliderDIV = $("<div  class='KViewPort_tool roi' style='padding:0px;height:21px'> </div>");
            var $timeinput = $("<input class='KViewPort_roiview_timeindicator KViewPort_tool roi' value='0' min='0' max='"+ (obj.nii.numTimePoints-1)+"'/>").appendTo($timesliderDIV)
                .on('change', function(){ 
                    var xval = $(this).val();
                    obj.nii.currentTimePoint.t = parseInt( xval )  
                    signalhandler.send("updateImage",{id: obj.roi.fileID});
                })
            function timeinputwheel(ev, delta) { ev = ev.originalEvent || ev;var newval = parseInt($(this).val())+((ev.wheelDelta>0)?1:-1);if(newval >= 0 && newval <obj.nii.numTimePoints) {$(this).val( newval ); $(this).trigger('change'); }ev.stopPropagation(); return false;  }
            $timeinput.bind("mousewheel", timeinputwheel);
                
            obj.divs.splice(2, 0, $timesliderDIV);    
            obj.$timeinput = $timeinput;

        }    

        obj.toggle = function (e)
        {
             var vis;
             if (obj.visible)
                vis = 0;
             else
                vis = 1;
             if (e.shiftKey)
                obj.toggle_visibility(vis)
             else
                KViewer.iterateMedViewers(function(viewer)
                {
                    obj;
                    for (var k = 0; k < viewer.ROIs.length; k++)
                    {
                        if(viewer.ROIs[k].roi.fileID == obj.roi.fileID)
                        {
                            viewer.ROIs[k].toggle_visibility(vis)
                        }
                    }
                });

        }

        obj.toggle_visibility = function(e)
        {
            if(e===0)
               obj.visible = true;
            else if(e===1)
               obj.visible = false;

            if (obj.visible)
            {
                obj.visible = false;
                //var target = $(e.target).is('i')?$(e.target):$(e.target).children();
                var target = $toggleVisible.find('i');
                target.addClass('fa-eye-slash').removeClass('fa-eye').css('color', 'red');

                if(obj.refSurfView)
                {
                    obj.refSurfView.visible = false;
                    obj.refSurfView.update();
                }

            }
            else
            {
                obj.visible = true;
                //var target = $(e.target).is('i')?$(e.target):$(e.target).children();
                var target = $toggleVisible.find('i');
                target.removeClass('fa-eye-slash').addClass('fa-eye').css('color', 'initial');

                if(obj.refSurfView)
                {
                    obj.refSurfView.visible = true;
                    obj.refSurfView.update();
                }

            }
            viewer.drawSlice({
                mosaicdraw: true
            });

        }
        if (typeof KMedImg3D == "undefined")
            $createIso.hide()

        obj.$currentpickerdiv = $currentpickerdiv;
        obj.$captiondiv = $captiondiv;
        if (obj.isCurrent)
        {
            $currentpickerdiv.addClass('current')
            viewer.currentROI = obj.roi;
            //
            viewer.toggleHairCrossControls( false );
        }

        if ( ! (intent != undefined && intent.hideview ) )
            viewer.toolbar.append(obj.divs, "roi");
        else
            obj.hideview = true;



		$createOutlines.click(function(ev) {
			if (obj.outlines == undefined)
			{
				obj.outlines = Outlines(obj)
			    obj.outlines.update(viewer);
			}
			else
			{
			    obj.outlines.close();
				obj.outlines = undefined;
			}


		});



        /*
            if (obj.roi.namedivs == undefined)
                obj.roi.namedivs = [];
            obj.roi.namedivs.push($captiondiv);
            $captiondiv.keydown(function(ev) { if (ev.keyCode == 13) { $(ev.target).blur(); return false } })
   						.keyup(function(ev)
            {
                obj.roi.filename = $captiondiv.text();
                if (obj.roi.namedivs != undefined)
                    for (var i = 0; i < obj.roi.namedivs.length;i++)
                    {
                        if ($captiondiv != obj.roi.namedivs[i])
                            obj.roi.namedivs[i].text(obj.roi.filename);
                    }
                that.update();
            }	);

*/
        attachNameDivHandler(obj.roi, $captiondiv, that.update);



        $dragdiv.attr("draggable", 'true');
        //            $dragdiv.on("dragstart", dragstarter({ type:'file', tag: '/mask/', mime: 'nii', filename: obj.roi.filename,  fileID: obj.roi.fileID }));

        $dragdiv.on("dragstart", dragstarter(function() {
            return {
                type: 'file',
                mime: 'nii',
                tag: '/mask/',
                filename: obj.roi.filename,
                fileID: obj.roi.fileID,
                intent: {
                    color: obj.color
                },
                close: close
            }
        }));


        $createIso.mousedown(function(ev)
        {
            if (obj.refSurfView && !obj.refSurfView.toolbarAttached)
            {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                var id = setTimeout(function()
                {
                    $createIso.onhold = true;
                    if (obj.refSurfView)
                    {
                        viewer.toolbar.append(obj.refSurfView.divs,'surface')
                        obj.refSurfView.toolbarAttached = true;
                    }

                },500);
                $(this).on("mouseleave mouseup",function(ev)
                {
                     clearTimeout(id);
                     $(this).onhold = false;
                     $(this).off("mouseleave mouseup");
                });
            }

        }    );




        $createIso.click(createISO);

        function createISO(ev,intent)
        {

            if ($createIso.onhold)
            {
                $createIso.onhold = undefined;
                return;
            }

            if (obj.refSurfView && !viewer.isGLenabled())
            {
                KViewer.roiTool.update3D(fobj,viewer.viewport.progressSpinner);
                viewer.toggle3D()
            }
            else
                viewer.attachSurfaceRef(obj,fobj,viewer.viewport.progressSpinner,intent)


        }


        if (fobj.fileinfo.surfreference != undefined)
        {
            var curRoiView = obj;
            $createIso.addClass("current");
            var surfView = viewer.appendObject3D(fobj.fileinfo.surfreference, {
                color: curRoiView.color
            });
            curRoiView.refSurfView = surfView;

        }



        if (intent != undefined && intent.visible != undefined && intent.visible == false)
            $toggleVisible.trigger('click');

        if (fobj.fileinfo.surfreference == undefined && (
             (intent && intent.isosurf && fobj.fileinfo.surfreference == undefined) ||
             (viewer.isGLenabled() && intent.isosurf != false) ) )
        {
            if (intent && intent.isosurf)
               createISO(undefined,intent.isosurf);
            else
                createISO();
        }



        /***************************************************************************************
            * activate this view for painting
            ****************************************************************************************/
        function makeCurrent()
        {
            // currentROI is global now for all viewports
            that.makeCurrentGlobal(obj.roi.fileID);
            /*
				currentROI = obj.roi!==currentROI?obj.roi:undefined;
			 	for(var v = 0; v<KViewer.viewports.length; v++)
			 	{

					var viewer = KViewer.viewports[v].getCurrentViewer();
					if(viewer==undefined)
						continue;

					 viewer.currentROI = undefined;
					 for (var k = 0; k < viewer.ROIs.length;k++)
					 {

						if (obj.roi == viewer.ROIs[k].roi & viewer.ROIs[k].isCurrent == false)
						{
						   viewer.ROIs[k].isCurrent = true;
						   viewer.currentROI = viewer.ROIs[k].roi;
						   viewer.ROIs[k].$currentpickerdiv.addClass("current");
						}
						else
						{
							viewer.ROIs[k].isCurrent = false;
							viewer.ROIs[k].$currentpickerdiv.removeClass("current");
						}
					 }

			 	}

			 	checkForAnyActiveRoi();
				that.roiPanel.update();
				*/
        }

        obj.makeCurrent = makeCurrent;



        if(state.viewer.showOutlines)
            obj.outlines = Outlines(obj);


        /***************************************************************************************
        * close a roi
        ****************************************************************************************/
        function close()
        {

            if (that.visibleROIs[obj.roi.fileID])
            {
                delete that.visibleROIs[obj.roi.fileID];
            }
            


            if (viewer.currentROI == obj.roi)
            {
                viewer.currentROI = undefined;
                // enable haircross controls (hover and mouse events ...) to be sure
                viewer.toggleHairCrossControls( true );
            }


            for (var k = 0; k < obj.divs.length; k++)
                obj.divs[k].remove();

            for (var k = 0; k < viewer.ROIs.length; k++)
            {
                if (obj == viewer.ROIs[k])
                {
                    viewer.ROIs.splice(k, 1);
                    break;
                }
            }

		    if (obj.outlines != undefined)
			{
			    obj.outlines.close();
				obj.outlines = undefined;
			}


            if (obj.refSurfView != undefined)
            {
                obj.refSurfView.close();
                obj.refSurfView = undefined;
            }

            checkForAnyActiveRoi();

            viewer.toolbar.update("roi")

            viewer.drawSlice({
                mosaicdraw: true
            });
        }


        obj.close = close;
        signalhandler.attach("close", close);




        return obj;
    }

    /***************************************************************************************
    * set the color of a roi in all viewports and layers (2D, 3D, 3D-objects)
    ****************************************************************************************/
    that.setColorGlobal = function(id, color)
    {
        if(typeof id == "object")
            id = id.fileID;

	    // we have this mess with colors being indices or rga or whatever
		// here, we need an index (a color number), so find it if necessary

        if(color instanceof KColor)
            color = KColor.findColorIndex(color.color) ;

        if(Array.isArray(color))
            color = KColor.findColorIndex(color) ;


        if (that.ROIs[id])
            that.ROIs[id].color = color;
        KViewer.iterateMedViewers(function(viewer)
        {
            for (var k = 0; k < viewer.ROIs.length; k++)
            {
                if(viewer.ROIs[k].roi.fileID == id)
                {
                    // call the individual color selectors of the representations
                    // these will also take care of 3D objects
                    //viewer.ROIs[k].$colselector.color_response(color)
                    viewer.ROIs[k].color = color;
                    if(viewer.ROIs[k].refSurfView != undefined)
                    {
                        viewer.ROIs[k].refSurfView.color = viewer.ROIs[k].color;
                        viewer.gl.setSurfColor(viewer.ROIs[k].refSurfView);
                    }
                    if (viewer.ROIs[k].$colselector)
                        viewer.ROIs[k].$colselector.updateColor();
                    viewer.drawSlice({
                    mosaicdraw: true
                    });
                }
            }
        });

    }

    /***************************************************************************************
    * toggle ROI painting (remember last selected one)
    ****************************************************************************************/
    that.lastCurrentROIID = undefined;
    that.toggleCurrentROI = function()
    {
        if(currentROI)
        {
            signalhandler.send("updateImage",{id: currentROI.fileID,no3d:true});
            that.lastCurrentROIID = currentROI.fileID;
            that.makeCurrentGlobal(currentROI.fileID);
        }
        else
        {
            that.makeCurrentGlobal(that.lastCurrentROIID)
            document.body.dispatchEvent(new Event('mousemove')); // show pen again
            that.lastCurrentROIID = undefined;
        }
    }


    /***************************************************************************************
    * make roi current in all viewports
    ****************************************************************************************/
    that.makeCurrentGlobal = function(id)
    {
        if (currentROI == that.ROIs[id]) // same id again, so toggle
        {
            currentROI = undefined;
            id = undefined
        }
        else
        {
            currentROI = that.ROIs[id];
        }
        KViewer.iterateMedViewers(function(viewer)
        {
            viewer.currentROI = undefined;
            // enable haircross controls (hover and mouse events ...) to be sure
            //viewer.toggleHairCrossControls( true );

            master.roiTool.hidePen(viewer);

            for (var k = 0; k < viewer.ROIs.length; k++)
            {
                if(viewer.ROIs[k].$currentpickerdiv)
                    viewer.ROIs[k].$currentpickerdiv.removeClass("current");
                viewer.ROIs[k].isCurrent = false;
                if (viewer.ROIs[k].roi == currentROI)
                {
                    if( viewer.ROIs[k].$currentpickerdiv )
                        viewer.ROIs[k].$currentpickerdiv.addClass("current");

                    viewer.ROIs[k].isCurrent = true;
                    viewer.currentROI = viewer.ROIs[k].roi;
                    // hide or disable the haircross controls
                    viewer.toggleHairCrossControls( false );

                }
            }
        });
        $table.find("tr").removeClass('selected');
        $table.find(".fa-pencil-square-o").removeClass("selected");
        var $row = $table.find("tr[id='KROI_" + id + "']");
        $row.addClass('selected');
        $row.find(".fa-pencil-square-o").addClass("selected");
        checkForAnyActiveRoi();
        if (id == undefined)
            that.roiPanel.disable();
        else
            that.roiPanel.enable();
        that.roiPanel.update();
    }

    that.getCurrentGlobal = function()
    {
        return currentROI;
    }


    that.customToggle = function(forcestate)
    {
        if (that.enabled)
        {
            1
        }
        else
        {
            that.roiPanel.hide();
            // deselect any active ROI
            if(currentROI)
                that.makeCurrentGlobal(currentROI.fileID)
        }
    }

    var roiPanel = that.roiPanel = new KRoiPanel(that);

    that.getState = roiPanel.getState;
    that.setState = roiPanel.setState;

    // do we need this because of tool proxy ...?
    //if(state.tools && state.tools.roiTool)
        //that.setState(state.tools.roiTool);

    // return the roi tool
    return that;
}



// ======================================================================================
// ======================================================================================
// ============= roi image proc functions
// ======================================================================================
// ======================================================================================

function cropConnectedComponent2(fobj,fobj2,p,t_offset)
{

    //var cropped  = KViewer.dataManager.cloneAsROI(fobj.fileID,fobj.filename + "cropped",undefined);
    //cropped = cropped[0];
    p = math.multiply(math.inv(fobj.content.edges), p);
    p = math.round(p._data);

    var data = fobj.content.data;
    var sz = fobj.content.sizes;

    var w = sz[0];
    var wh = sz[0] * sz[1];
    var whd = wh * sz[2];

    var tmp = new Uint8Array(whd);

    var offs = 0;
    if (fobj.content.currentTimePoint != undefined)
    {
        offs = whd*fobj.content.currentTimePoint.t;
        if (t_offset != undefined)
            offs = whd*t_offset;
    }

    function findseed()
    {
        for (var n = 0; n < 3; n++)
            for (var x = -n; x < n; x++)
                for (var y = -n; y < n; y++)
                {
                    a = x + p[0];
                    b = y + p[1];
                    c = n + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];
                    a = x + p[0];
                    b = y + p[1];
                    c = -n + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];

                    a = x + p[0];
                    b = n + p[1];
                    c = y + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];
                    a = x + p[0];
                    b = -n + p[1];
                    c = y + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];

                    a = n + p[0];
                    b = x + p[1];
                    c = y + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];
                    a = -n + p[0];
                    b = x + p[1];
                    c = y + p[2];
                    if (data[a + w * b + wh * c + offs] > 0.5)
                        return [a, b, c];
                }
    }
    p = findseed();



    var data_ = new Uint8Array(fobj.content.buffer,fobj.content.hdroffset+offs);

        
    if (p == undefined)
        return []

    var changedPoints = floodfill(data_, tmp, fobj.content.sizes, p, 1);
    if (fobj2 == "keep")
    {
        var cp = [];
        for (var k = 0; k < whd; k++)
        {
            if (tmp[k] >=0.5)
                fobj.content.data[k+offs] = 1;
            else
            {
               if (fobj.content.data[k+offs]>0)
                 cp.push(k+offs);
               fobj.content.data[k+offs] = 0;
            }
        }
        return cp;            
    }
    else
    {    
        var s;
        if (fobj2 != undefined)
            s = function(k) {fobj.content.data[k+offs]=0;fobj2.content.data[k+offs]=1;}
        else
            s = function(k) {fobj.content.data[k+offs]=0;}
        for (var k = 0; k < whd; k++)
            if (tmp[k]> 0.5)
              s(k);
        for (var k = 0; k < changedPoints.length;k++)
            changedPoints[k] += offs;
        return changedPoints;
    }

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



regionGrow.changedPoints = [];
regionGrow.currentStacksize = 0;
regionGrow.currentStack = undefined;

function regionGrow(contrast, vol, A, B ,size, seed,valtoset, clim, restrictedToPen,
         radiusx, radiusy, radiusz, sx2, sy2, sz2, r2,callback, offset,offset_target)
{
    if (offset == undefined)
        offset = 0;
    if (offset_target == undefined)
        offset_target = 0;

    if (valtoset == 1)
        valtoset = Math.floor(Math.random()*250)+1;

    if (regionGrow.timeout != -1)
    {
        clearTimeout(regionGrow.timeout);
        regionGrow.timeout = -1;
    }

    for (var k = 0; k < regionGrow.changedPoints.length;k++)
            vol[regionGrow.changedPoints[k]] = 0;

    regionGrow.changedPoints = [];

    var changedPoints = regionGrow.changedPoints;


    var mystacksize = size[0] * size[1] * size[2];
    if (mystacksize > regionGrow.currentStacksize)
        {
            var mxst =50000000;
            if (mystacksize>mxst)
                mystacksize = mxst;
            regionGrow.currentStack = new Uint32Array(mystacksize );
            regionGrow.currentStacksize = mystacksize;

        }

    var mystack = regionGrow.currentStack;

    var w = size[0];
    var h = size[1];
    var d = size[2];
    var wh = size[0] * size[1];
    var whd = size[0] * size[1] * size[2];


    offset = offset * whd;
    offset_target = offset_target * whd;

    var cnt = 0;

    //var data = contrast.data;
    if (isIdentity(A))
    {
        if( contrast.datascaling.id )
            var data = function(idx) { return  contrast.data[idx + offset] ; }
        else
            var data = function(idx) { return  contrast.datascaling.ie( contrast.data[idx + offset] ); }
    }
    else
    {
        if( contrast.datascaling.id )
            var data = function(idx) {
                var x = idx%w;
                var y = Math.floor(idx/w)%h;
                var z = Math.floor(idx/wh)%d;
                return trilinInterp(contrast, x,y,z, A, offset);
            }
        else
            var data = function(idx) {
                var x = idx%w;
                var y = Math.floor(idx/w)%h;
                var z = Math.floor(idx/wh)%d;
                return  contrast.datascaling.ie(trilinInterp(contrast, x,y,z, A, offset));
            }

    }



    function push(x)
    {
        if (cnt < mystacksize)
        {
            mystack[cnt] = x;
            if (valtoset > 0 && vol[x] == 0)
                changedPoints.push(x);
            vol[x+offset_target] = valtoset;
            cnt++;
        }
    }
    function pop()
    {
        cnt--;
        return mystack[cnt];
    }



    var restriction = function() {
        return true
    }
    ;
    if (restrictedToPen)
    {
      if (isIdentity(B))
      {
        restriction = function(idx)
        {
            var x = math.floor(math.abs(idx % w - seed[0]));
            var y = math.floor(math.abs(idx / w % h - seed[1]));
            var z = math.floor(math.abs(idx / wh - seed[2]));
            return x <= radiusx && y <= radiusy && z <= radiusz && x * x * sx2 + y * y * sy2 + z * z * sz2 < r2;
        }
      }
      else
      {
        restriction = function(idx)
        {
            var x_ = (idx % w ) -seed[0];
            var y_ = (idx / w % h ) -seed[1];
            var z_ = (idx / wh ) -seed[2];
            var x = math.floor(math.abs(B[0][0]*x_ + B[0][1]*y_ + B[0][2]*z_ ));
            var y = math.floor(math.abs(B[1][0]*x_ + B[1][1]*y_ + B[1][2]*z_ ));
            var z = math.floor(math.abs(B[2][0]*x_ + B[2][1]*y_ + B[2][2]*z_ ));


            return x <= radiusx && y <= radiusy && z <= radiusz && x * x * sx2 + y * y * sy2 + z * z * sz2 < r2;

        }
      }
    }








    var t = 1;
    if (contrast.sizes.length > 3)
        t = contrast.sizes[3];


    var v;
    var trans;
    var e;

    if (0) //t > 1)
    {

        function trans(a)
        {
            a = Math.abs((a - clim[0])) / (clim[1] - clim[0]);
            return a;
        }

        var norm = 0;
        v = [];
        for (var k = 0; k < t; k++)
        {

            v[k] = ( data( seed[0] + w * seed[1] + wh * seed[2] + whd * k ) ) ;
            norm += v[k] * v[k];
        }
        norm = math.sqrt(norm);
        for (var k = 0; k < t; k++)
            v[k] /= 0.0000001 + norm;

        var sim_thres = 2.5 - regionGrow.helper.simscaling / 100;
        if (sim_thres < 0)
            sim_thres = 0;

//        sim_thres = 1-Math.abs(regionGrow.helper.simscaling/800);

        sim_thres = 0.99;

        e = function(idx) {
            if (!restriction(idx))
                return false;
            var d = 0;
            var z = 0;
            for (var k = 0; k < t; k++)
            {
                var d_ = data( idx + whd * k ) ;
                if (d_ != undefined)
                {
                    var a = (d_);
                    d += a * v[k];
                    z += a * a;
                }
                else
                    return false;
            }
            return ( d/Math.sqrt(z) >= sim_thres) ;

        }
    }
    else
    {
        if (clim.threshold != undefined)
            trans = function(a) { return (a>clim.threshold)?1:0;  }
        else if (clim.threshold_higher != undefined && clim.threshold_lower != undefined)
            trans = function(a) { return (a>clim.threshold_higher & a<clim.threshold_lower  )?1:0;  }
        else if (clim.threshold_higher != undefined)
            trans = function(a) { return (a>clim.threshold_higher)?1:0;  }
        else if (clim.threshold_lower != undefined)
            trans = function(a) { return (a<clim.threshold_lower)?1:0;  }
        else
            trans = function(a)
            {
                a = (a - clim[0]) / (clim[1] - clim[0]);
                if (a > 1)
                    a = 1;
                if (a < 0)
                    a = 0;
                return a;
            }

        if (clim.threshold  != undefined)
            v = 1;
        else
            v = trans(data (seed[0] + w * seed[1] + wh * seed[2] ));

        var dist_thres = Math.exp(regionGrow.helper.simscaling*0.01)*0.2-0.1;
       // var dist_thres = Math.abs(regionGrow.helper.simscaling*0.001);
        if (dist_thres < 0)
            dist_thres = 0;

        if (clim.threshold_higher != undefined || clim.threshold_lower != undefined )
            e = function(idx) {
                if (!restriction(idx))
                    return false;
                if (data(idx) != undefined)
                    return trans(data(idx));
                else
                    return false;
            }
        else
            e = function(idx) {
                if (!restriction(idx))
                    return false;

                if (data(idx) != undefined)
                {
                    var a = trans(data(idx));

                    return math.abs(a - v) <= dist_thres;
                }
                else
                    return false;
            }
    }


    var startidx = seed[0] + w * seed[1] + wh * seed[2];

    if (!e(startidx) ) //| vol[startidx] > 0)
    {
        callback(changedPoints);
        return;
    }


    push(startidx);

    var iteration = 0;
    var maxit = 1024;

    doit();

    function doit()
    {
        while (cnt > 0 && iteration < maxit)
        {
            var idx = pop();
            if (idx >= 0 & idx < whd)
            {
                if (e(idx + 1, idx) & vol[idx + 1] != valtoset)
                    push(idx + 1);
                if (e(idx - 1, idx) & vol[idx - 1] != valtoset)
                    push(idx - 1);
                if (e(idx + w, idx) & vol[idx + w] != valtoset)
                    push(idx + w);
                if (e(idx - w, idx) & vol[idx - w] != valtoset)
                    push(idx - w);
                if (e(idx + wh, idx) & vol[idx + wh] != valtoset)
                    push(idx + wh);
                if (e(idx - wh, idx) & vol[idx - wh] != valtoset)
                    push(idx - wh);
            }
            iteration++;
        }


        iteration = 0;

        if (cnt > 0)
            regionGrow.timeout = setTimeout(doit,0);
        else
        {
            regionGrow.timeout = -1;
            if (restrictedToPen)
               regionGrow.changedPoints = [];
            callback(changedPoints);
        }

        //callback(changedPoints)

    }



}

function removesalt(data, size)
{
    var res = bwconncomp(data, size , function (x) { return x>0;},  removesalt.threshold , data)
    return res.changedPoints;
}
removesalt.threshold = 100;


function createConnCompAnalysis(fobj)
{
   var conncompdesc = '';

   if (fobj.ccanalysis == undefined)
   {
       fobj.ccanalysis = {
       enabled:true,
       inprogress:0,
       update: function()
       {
            if (this.cid != undefined)
            {
                clearTimeout(this.cid);
                fobj.ccanalysis.inprogress--;
            }
            fobj.ccanalysis.inprogress++;
            this.cid = setTimeout( function()
            {
                this.cid = undefined;
                bwconncomp_worker(fobj.content.data, fobj.content.sizes,1,function (res)
                {
                    fobj.ccanalysis.inprogress--;
                    fobj.ccanalysis.cc = res;
                    if (fobj.ccanalysis.persistent == undefined)
                    {
                        fobj.ccanalysis.persistent = [];
                        fobj.ccanalysis.persistent.cnt = 0;
                        for (var k in res.centerOfGrav)
                        {
                            var v = res.centerOfGrav[k];
                            var p = math.round(math.multiply(fobj.content.edges,[v[0],v[1],v[2],1])._data);
                            fobj.ccanalysis.persistent[fobj.ccanalysis.persistent.cnt++] = {name: conncompdesc + p[0] + "," + p[1] + "," +p[2], idx:k , cog:v};
                        }

                    }
                    else
                    {
                        for (var j=0;j <fobj.ccanalysis.persistent.length;j++)
                            fobj.ccanalysis.persistent[j].idx = undefined;
                        for (var j=0;j <fobj.ccanalysis.persistent.length;j++)
                        {
                            var y = fobj.ccanalysis.persistent[j].cog;
                            var min_d = 999999;
                            var min_idx = -1;
                            for (var k in res.centerOfGrav)
                            {
                                if (!res.centerOfGrav[k].assigned)
                                {
                                    var x = res.centerOfGrav[k];
                                    var d =  Math.abs(x[0]-y[0])+Math.abs(x[1]-y[1])+Math.abs(x[2]-y[2]);
                                    if (d < min_d && d < 10)
                                    {
                                        min_idx = k;
                                        min_d = d;
                                    }
                                }
                            }
                            if (min_idx != -1)
                            {
                                res.centerOfGrav[min_idx].assigned = true;
                                fobj.ccanalysis.persistent[j].idx = min_idx;
                            }
                        }
                        for (var k in res.centerOfGrav)
                        {
                            if (!res.centerOfGrav[k].assigned)
                            {
                               var v = res.centerOfGrav[k];
                               var p = math.round(math.multiply(fobj.content.edges,[v[0],v[1],v[2],1])._data);

                               fobj.ccanalysis.persistent.push({name:  p[0] + "," + p[1] + "," +p[2], idx:k , cog:res.centerOfGrav[k]} )
                               fobj.ccanalysis.persistent.cnt++
                            }
                        }
                        for (var j=0; j < fobj.ccanalysis.persistent.length;j++)
                        {
                           if (fobj.ccanalysis.persistent[j] == undefined || fobj.ccanalysis.persistent[j].idx == undefined)
                           {
                               fobj.ccanalysis.persistent.splice(j,1); j--;
                           }
                        }

                    }

                    // sort the list by z,y,x
                    function sortfun(a,b,idx){ return (a.cog[idx] - b.cog[idx]);}
                    fobj.ccanalysis.persistent
                        .sort(function(a,b){ return sortfun(a,b,0) ; })
                        .sort(function(a,b){ return sortfun(a,b,1) ; })
                        .sort(function(a,b){ return sortfun(a,b,2) ; });

                    if (fobj.ccanalysis.inprogress <= 0)
                    {
                        KViewer.roiTool.update();
                        fobj.ccanalysis.inprogress = 0;
                    }
                    this.cid = undefined;
                },fobj)

            },250);

       } };

       fobj.ccanalysis.update();



   }

}

function splatter(fobj)
{
    var res = bwconncomp(fobj.content.data, fobj.content.sizes , function (x) { return x>0;},1);

    var sobj = []
    for (var k  in res.clusterSize)
        sobj.push({idx:k,sz:res.clusterSize[k]});
    sobj.sort(function(x,y) { return y.sz-x.sz;});
    alertify.prompt("Keep the N largest out of " + sobj.length + " pieces ", function(e, str) {
            if (e)
            {
                fobj;
                var num = parseInt(str);
                for (var k = 0; k < num & k < sobj.length; k++)
                {
                    var idx = parseInt(sobj[k].idx);
                    var nfobj = KViewer.dataManager.cloneAsROI(fobj.fileID, fobj.filename + "_" + k)[0];
                    var dlen = nfobj.content.data.length;
                    res;
                    for (var j = 0; j < dlen;j++)
                    {
                        if (res.labels[j] == idx)
                            nfobj.content.data[j] = 1;
                    }
                    KViewer.roiTool.ROIs[nfobj.fileID] = nfobj;
                    nfobj.color = Object.getOwnPropertyNames(KViewer.roiTool.ROIs).length % 5;


                }
                KViewer.roiTool.update();

            }

        },"5");

}



function bwconncomp_worker(data, size, clustthres, done, persistent)
{
    var worker
    if (persistent)
        worker = persistent.worker;
    

 	worker = executeImageWorker({func:'conncomp',
 	    data:data,
 	    size:size,
 	    clustthres:clustthres,keepOpen:persistent!=undefined }, 	
 	    [],
 	 	function(e)
 	 	{
			//progress(e);
 	 	}
 	 	,
 	 	function(e)
 	 	{
			done(e.execObj);		
 	 	},
 	 	worker
 	 	);
 	 
 	if (persistent != undefined)
 	  persistent.worker = worker;


 	return worker;
 
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




/***************************************************************************************
* The new Roi panel in the viewport
****************************************************************************************/
function KRoiPanel(parent)
{

    var that = new Object();

    var $target = parent.$panelcontainer;
    $target.empty();

    var $container = $("<div class='roiTool_panel'></div>");
    that.$container = $container;

    var roiTool = parent;
    $container.appendTo($target);

    that.show = function()
    {
        $container.show();
        $('.roiTool_svg').show();
    }


    function getParentViewer()
    {
        // get the parent from current location of the panel
        var off = that.$container.offset();
        var foundViewer;

        for (var v = 0; v < KViewer.viewports.length; v++)
        {
            if (KViewer.viewports[v] != undefined)
            {
                var viewer = KViewer.viewports[v].getCurrentViewer();
                if (viewer == undefined)
                    continue;
                var $c = KViewer.viewports[v].$container;
                var off2 = $c.offset();

                if (off.left < off2.left + $c.width() & off.left > off2.left & off.top < off2.top + $c.height() & off.top > off2.top)
                {
                    foundViewer = viewer;
                    break;
                }
            }
        }

        // if over nobody, try to take the first match
        if (foundViewer == undefined)
            for (var v = 0; v < KViewer.viewports.length; v++)
            {
                var viewer = KViewer.viewports[v].getCurrentViewer();
                if (viewer !== undefined)
                {
                    foundViewer = viewer;
                    break;
                }

            }

        return foundViewer;
    }
    that.getParentViewer = getParentViewer;


    that.hide = function()
    {
        $('.roiTool_svg').hide();
    }

    that.enabled = false;
    that.toggle = function()
    {
        if (that.enabled)
            that.disable();
        else
            that.enable();
    }

    that.enable = function()
    {
        that.enabled = true;
        roiTool.togglePen(true);
        $container.find(".roiTool_panel_flex").removeClass("inactive");
        $penActiveBtn.addClass('KViewPort_tool_enabled')
        $drawingEnabledSign.show();
    }
    that.disable = function()
    {
        that.enabled = false;
        roiTool.togglePen(false);
        //$container.find(".roiTool_panel_flex").addClass("inactive");
        //$history.addClass("inactive");
        $penActiveBtn.removeClass('KViewPort_tool_enabled')
        $drawingEnabledSign.hide();

    }



    // ----------- the "create new roi row""
    var $fileRow = $("<div style='white-space:nowrap' class='roiTool_panel_flex persistent'></div>").appendTo($container);
    var $newEmptyRoi = $("<a class='KViewPort_tool' ><span style=''>New ROI</span></a>").appendTooltip("createemptyroi").click(createNewRoiButton).appendTo($fileRow);
    var $drawingEnabledSign = that.$drawingEnabledSign =  $("<a class='' style='background:darkred; width:15px; height:15px;margin-left:5px; border-radius:10px;' ><span style=''></span></a>").appendTo($fileRow).hide();

    //var $newnameWrap = $("<span id='roi_default_names_wrap'   class=' persistent'></span>").appendTo($fileRow);

    var $penActiveBtn = $("<i class='KViewPort_tool  KViewPort_tool_enabled fa fa-power-off'></i>").click(function() {
        that.toggle();
    }).appendTooltip("enable/disable roi drawing");
    //$penActiveBtn.hide();

    //$fileRow.append($penActiveBtn);
    //$fileRow.append($("<i class='flexspacer'></i>"));


    function createNewRoiButton()
    {
        if(state.autoROI && state.autoROI.enable)
        {
            var rlist = state.autoROI.roiList;
            for(var k=0; k<rlist.length; k++ )
            {
                var roiname = rlist[k].name;
                var vpid = rlist[k].viewportID;
                var medViewer = roiTool.master.viewports[vpid].medViewer;
                if(medViewer != undefined && medViewer.nii !=undefined)
                {
                    var fileID = KViewer.dataManager.getFileIdByNiiFile( medViewer.niiOriginal );
                    roiTool.createRoisFromFileID(fileID, undefined, medViewer, roiname);
                }

            }
        }
        else
        {
            var niftis = {};
            roiTool.master.iterateMedViewers(function(medViewer)
            {
                if (medViewer.nii !== undefined && !medViewer.nii.dummy)
                {
                    //var key = "" + medViewer.nii.edges._data.toString() + medViewer.nii.voxSize.toString();
                    var key = "" + medViewer.niiOriginal.edges._data.toString() + medViewer.niiOriginal.voxSize.toString();
                    niftis[key] = medViewer.niiOriginal;
                }
            });
            var list = Object.getOwnPropertyNames(niftis);
            //console.log(list);
            if (list.length == 0)
            {
                alertify.alert('There are currently no images loaded in any viewport. <br>I need one as a template.')
                return false;
            }
            else if (list.length > 1)
            {
                alertify.alert('There are images with different geometries / sizes in your viewports. <br> Please drag your desired template image onto the ROI panel to create a new roi.')
                return false;
            }
            else
            {
                var fileID = KViewer.dataManager.getFileIdByNiiFile(niftis[list[0]]);
                roiTool.createRoisFromFileID(fileID);
            }
        }
    }


    /***************************************************************************************
    the autoROIcreateor dialog
    ****************************************************************************************/
    $("<i class='flexspacer'></i>").appendTo($fileRow);
    var $autoROIDialog = $("<a class='KViewPort_tool' "+ ((state.autoROI != undefined && state.autoROI.enable)?'background:green':'')  +"' ><span> <i class = 'fa fa-car'></i> </span></a>").appendTooltip("autoROIcreator").click(autoROIDialog).appendTo($fileRow);

    var autoROIForm =
    {
        name 		: "autoROI",
        layout:
        [
             {name:"enable"	  , type: 'check',     defaultval:false, class:"autoloaderitem" }
            ,{name:"roiList" , type: 'formarray', title:'', createbutton:"add new rule for a ROI",
                layout:[

                     {name:"name" , type: 'input', defaultval:"untitled"  , title:'name'}
                    ,{name:"viewportID" , type: 'option', defaultval:0 , title:'viewport ID', choices: [0,1,2,3,4,5]}

                    ]
            }
        ]
    }

    if(state.autoROI == undefined)
        state.autoROI = KForm.getFormContent(autoROIForm, {} );


    function autoROIDialog(args)
    {
        if($("#autoROIDialog").length > 0 )
            return false;
        var that = new dialog_generic();
        that.$frame.width(500).height(600);
        that.$frame.css({left:200, top:150} );
        that.$frame .css('z-index', 100000);
        that.$frame.show();
        that.$menu.append("<li>autoROI creation</li>");
        that.$frame.attr('id', 'autoROIDialog');

        that.deleteonclose = true;

        var helptext = "With this feature, multiple ROIs will be created at one click on the 'New ROI' button. Use comma separated list to create multiple ROIs per viewport."
        var $topbar = $("<div class='' style='font-size:16px; padding:10px; background:hsl(50,50%,40%);'>" + helptext + "</div>").appendTo(that.$container);

        var $middlebar = $("<div class='' style=''></div>").appendTo(that.$container);
        var $searchbox = $("<div class='' style=''></div>").appendTo($middlebar);

        var $toolbar = $("<div class='modernbuttongroup' ></div>").appendTo($middlebar);
        //var $startsearch = $("<div class='modernbutton small green'><i style='padding:0px' class='fa fa-binoculars'></i><i style='padding:0px;display:none;' class='fa fa-spinner fa-spin'></i> Start search</div>").appendTo($toolbar).click( submitquery );


        var $results   = $("<div class='' style='display:flex;flex-direction:column;align-items:center:justify-content:center;padding:20px;'></div>").appendTo(that.$container);


        KForm.createForm(autoROIForm, state.autoROI , $searchbox);
        $searchbox.find('input[type="checkbox"]').on("change", function(){
        if($(this).is(':checked'))
             $autoROIDialog.css('background', 'green')
        else
             $autoROIDialog.css('background','');

        }) ;


        $searchbox.find('input').attr('autocomplete', 'off');
        //$searchbox.find('input').get(0).focus();

        return that;
    }



    var $selectRoi = $("<ul class=''></ul>").click();
    // parent.addAsROIMenu  );
    // 	$fileRow.append($selectRoi);
    // 		that.buildRoiSelector = function()
    // 		{
    // 			$selectRoi.empty();
    // 			var rlist = Object.keys(roiTool.ROIs);
    // 			for(var k=0; k <rlist.length; k++)
    // 			{
    // 				$selectRoi.append($("<li>"+ roiTool.ROIs[rlist[k]].filename +"<span></span></li>")
    // 					.click( function(ev){ roiTool.ROIs[rlist[k]].fileID } ) );
    // 			}
    // 			$selectRoi.append($("<li>Create New Roi<span></span></li>")).click(function(ev){getParentViewer().addAsROIMenu(ev); that.buildRoiSelector(); });

    // 		}
    // 	that.buildRoiSelector();

    // ----------- the history
    $("<div class='roiTool_panel_caption'></div>").appendTo($container);
    var $history = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
    var $stepBack = $("<span class='KViewPort_tool'><i class=' fa fa-reply'></i> </span>").appendTooltip("undo").click(function() {
        roiTool.history.goto(1)
    });
    var $stepFwd = $("<span class='KViewPort_tool'><i class=' fa fa-mail-forward '></i> </span>").appendTooltip("redo").click(function() {
        roiTool.history.goto(-1);
    });
    //$history.append($stepBack).append($stepFwd);
    $history.append($("<span>undo</span>")).append($stepBack).append($("<i class='flexspacer'></i><span>redo</span>")).append($stepFwd);
    // ----------- the pen

    $container.append( $("<div class='roiTool_panel_flex'><span>Size XY</span><i class='flexspacer'></i><span>Size Z</span></div>") );

    var $circlePenRow = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
    var $inplaneradius = $(" <input type___ = 'number' min='0' max='100' value='" + roiTool.pencil.radius + "' /> ").on('change', function(ev) {
        roiTool.pensizechange(ev, "radius")
    });
    var $outplaneradius = $(" <input type___ = 'number' min='0' max='100' value='" + roiTool.pencil.radius_z + "' /> ").on('change', function(ev) {
        roiTool.pensizechange(ev, "radius_z")
    });
    $circlePenRow.append($("<i class='flexspacer'></i>")).append($inplaneradius).append($outplaneradius);
    that.$inplaneradius = $inplaneradius;


	KMouseSlider( $inplaneradius, {min:0, incrementPerPixel: .1, logScaling:10 });
	KMouseSlider( $outplaneradius, {min:0, incrementPerPixel: .1, logScaling:10 });



    var $thresBtn = $("<i class='RoiPen KViewPort_tool fa fa-power-off'></i>").click(
    function(ev)
    {
        selectPen();
        setThreshPen(ev)
    });

    function setThreshPen(ev, tpen)
    {

        if(tpen!== undefined)
        {
            roiTool.threspen = tpen;
            $thresInput.val( roiTool.pencil.thres_low );
            $thresInput2.val( roiTool.pencil.thres_high );
        }
        else
        {
            roiTool.threspen = ( roiTool.threspen + 1) % 3;
        }

        $thresBtn.removeClass(" KViewPort_tool_enabled fa-power-off fa-arrow-circle-up fa-arrow-circle-down");
        //$threshPlaceholder.hide();

        if (roiTool.threspen == 0) {
            $thresBtn.addClass('fa-power-off');
            //$threshPlaceholder.show();
            $threshPlaceholder.text('disabled');
            $threshPenInputRow.slideUp();
        }
        else
        {
            selectPen()
            $thresBtn.addClass('fa-arrow-circle-up');
            $threshPenInputRow.slideDown().css('display', '');
        }

        if (roiTool.threspen == 1) {
            $thresBtn.addClass('fa-arrow-circle-up');
            $threshPlaceholder.text('unrestricted');  }
        if (roiTool.threspen == 2) {
            roiTool.regionGrowRestric = true;
            $thresBtn.addClass('fa-arrow-circle-down');
            $threshPlaceholder.text('regiongrow');  }
    }


    var $thresInput  = $(" <input value='" + roiTool.pencil.thres_low + "' style='_width:100%' /> ").on('change', changeTreshInput).on('click', function(ev) { return false });
    var $thresInput2 = $(" <input value='" + roiTool.pencil.thres_high + "' style='_width:100%' /> ").on('change', changeTreshInput2).on('click', function(ev) { return false });
    function changeTreshInput(ev)
    {
        var vval = $thresInput.val();
        if(vval != "climL" & vval != "climR" & vval != "off")
        {
            vval = parseFloat(vval);
        }
        roiTool.pencil.thres_low = vval;
        return false;
    }

    function changeTreshInput2(ev)
    {
        var vval = $thresInput2.val();
        if(vval != "climL" & vval != "climR" & vval != "off")
        {
            vval = parseFloat(vval);
        }
        roiTool.pencil.thres_high = vval;
        return false;
    }
    var $thresInputWrap = $(" <div> </div> ").append($thresInput);
    var $thresInputWrap2 = $(" <div> </div> ").append($thresInput2);

    $("<div class='roiTool_panel_caption'>Thresholds</div>").appendTo($container);
    var $threshPenRow = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
    var $threshPlaceholder = $("<div class=''>Disabled</div>");

    $threshPenRow.append($thresBtn).append($("<i class='flexspacer'></i>")).append($threshPlaceholder);

    var $threshPenInputRow = $("<div class='thresPenInput' ></div>").appendTo($container);
    var $thresInputInner = $("<div class='roiTool_panel_flex'></div>").appendTo($threshPenInputRow).append($thresInputWrap).append($thresInputWrap2);

    var $thresInputMenuL = $("<div class='threspenclimsel''></div>").appendTo($thresInputWrap)
        .append( $("<div class='threspenclimsel''>off</div>").click(function(){ $thresInput.val('off'); changeTreshInput()}) )
        .append( $("<div class='threspenclimsel'>climL</div>").click(function(){ $thresInput.val('climL'); changeTreshInput()}) )

    var $thresInputMenuR = $("<div class='threspenclimsel''></div>").appendTo($thresInputWrap2)
        .append( $("<div class='threspenclimsel'>off</div>").click(function(){ $thresInput2.val('off'); changeTreshInput2()}) )
        .append( $("<div class='threspenclimsel'>climR</div>").click(function(){ $thresInput2.val('climR'); changeTreshInput2()}) )
    

	KMouseSlider( $thresInput, {min:-Infinity, max:Infinity, incrementPerPixel: 1 });
	KMouseSlider( $thresInput2, {min:-Infinity, max:Infinity, incrementPerPixel: 1 });

    setAutoSelectAllOnFocus($thresInput);
    setAutoSelectAllOnFocus($thresInput2);

    $threshPenInputRow.hide();

    // ----------- the smart pen
    $("<div class='roiTool_panel_caption'>Regiongrow</div>").appendTo($container);
    var $smartPenRow = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
    var $smartPenBtn = $("<i class='RoiPen KViewPort_tool fa fa-magic'></i>").click(selectPen).appendTooltip("drawonlyonsimilarcolors");
    var $regionGrowPenBtn = $("<i class='RoiPen  KViewPort_tool fa fa-fw fa-map-pin'></i>").click(selectPen).appendTooltip("regionfillsimilarcolors");
    var $regionGrowPenBtnRestric = $("<i class='RoiPen KViewPort_tool fa fa-fw fa-map-marker'></i>").click(selectPen).appendTooltip("regionfillwithinpen");
    // 	   var $tresh =  $(" <input type = 'number' min='0' max='100' value='"+pencil.radius+"' /> ").on('change', function (ev) { pensizechange(ev,"radius")});
    // 	   var $direction = $("<i class='KViewPort_tool fa fa-arrow-up'></i>");
    $smartPenRow.append($smartPenBtn).append($regionGrowPenBtnRestric).append($regionGrowPenBtn).append($("<i class='flexspacer'></i>"));
    //.append($direction).append($tresh);




    // ----------- the polygon Tool
    	$("<div class='roiTool_panel_caption'>Polygon</div>").appendTo($container);
	var $polygonRow   = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
    //var $polygonPenBtn = $("<i class='KViewPort_tool fa fa-openid'></i>").click(	function() { KMarkerPanel_outline()   } );

    that.polymarkerset     = undefined;
    roiTool.polyEnabled = 0;
    var $polygonPenBtn = $("<i class='KViewPort_tool fa fa-openid'></i>").click(	function() {
        roiTool.polyEnabled = !roiTool.polyEnabled;
        if(roiTool.polyEnabled)
        {
            $polygonPenBtn.addClass('KViewPort_tool_enabled');
            that.polymarkerset = that.polymarkerset || KMarkerPanel_roiScribble(); 
            if ( that.polymarkerset.markerPanel == undefined)
                that.polymarkerset.showPanel()
            that.polymarkerset.markerPanel.$fileRow.hide();
            that.polymarkerset.markerPanel.$toolsRow.hide();
            //that.polymarkerset.markerPanel.$close.off("click").click(function(){roiTool.closePolyTool()});
            that.polymarkerset.markerPanel.$close.off("click").click(function(ev){roiTool.closePolyTool();ev.stopPropagation(); ev.preventDefault(); return false;});
                /*
                that.polymarkerset.markerPanel.btns.$locked.hide()
                that.polymarkerset.markerPanel.btns.$hoverdetails.hide()
                that.polymarkerset.markerPanel.btns.$showOnAllImages.hide()
                that.polymarkerset.markerPanel.btns.$defaultradius.hide()
                */
                //that.polymarkerset.markerPanel.$toolsRow.hide();
                //that.polymarkerset.markerPanel.$close.hide();
                //that.polymarkerset.markerPanel.$scribbleRow.html(helptext)
            markerProxy.setCurrentSet( that.polymarkerset  );
        }
        else
        {
            $polygonPenBtn.removeClass('KViewPort_tool_enabled');
            markerProxy.currentSet = undefined;
            if ( that.polymarkerset.markerPanel != undefined)
            {
                that.polymarkerset.markerPanel.$container.hide()
            } 
           // if(roiTool.lastCurrentROIID)
           //    roiTool.toggleCurrentROI();
        }
        that.polymarkerset.deleteAllPoints();
   
    } );
    //var $polyThrash = $("<i class='KViewPort_tool fa fa-fw fa-trash'></i>").click( function(){ that.polymarkerset.deleteAllPoints() } ).appendTooltip("clear")
    //var $polyInterpSlices = $("<i class='KViewPort_tool fa fa-fw fa-clone'></i>").click( function(){ that.polymarkerset.interplate_scribbles(); alertify.success('Interpolated all slices, please verify') } ).appendTooltip("interpolate")
    //var $polyFill = $("<i class='KViewPort_tool fa fa-fw fa-pencil'></i>").click( function() { that.polymarkerset.map_to_ROI()} ).appendTooltip("mapToActiveROI")    
    var helptext = "Click to draw polygon (pointwise, or drag mouse)<br>Click circle symbol to close polygopn. <br>Click to add intermediate points to closest segment.<br>Use 'pencil' button to fill current ROI.<br>You can also draw several polygons in distinct slices and use 'copy' button to interpolate polygons."
    var $polyHelp   = $("<i class='KViewPort_tool fa fa-question'></i>").click( function(){ 
            var that = new dialog_generic();
            that.$frame.width(500).height(600);
            that.$frame.css({left:200, top:150} );
            that.$frame .css('z-index', 100000); 
            that.$frame.show();
            that.$menu.append("<li>PolgyonTool - Help</li>");
            that.deleteonclose = true;
            that.$container.html(helptext)

     } );

  	$polygonRow.append($polygonPenBtn)
  	$polygonRow.append($polyHelp)
  	
  	//$polygonRow.append($polyFill).append($polyInterpSlices)

  	roiTool.closePolyTool = function()
  	{
  	    if (roiTool.polyEnabled)
  	     $polygonPenBtn.trigger("click");
  	}

    
    // ----------- the special tools4



    /*
	$("<div class='roiTool_panel_caption'>Advanced Tools</div>").appendTo($container);
	var $miscToolsRow   = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
      var $copySlice =   $("<i class='KViewPort_tool fa fa-copy'></i>").click();
      var $pasteSlice =   $("<i class='KViewPort_tool fa fa-paste'></i>").click();
      var $special =   $("<i class='KViewPort_tool fa fa-wrench'></i>").appendTooltip("misctools").click(function(ev){
      		if(getParentViewer().currentROI === undefined) return; roiTool.tools_contextmenu_dynamic(ev, getParentViewer().currentROI.fileID) }  );

	$miscToolsRow.append($("<i></i>")).append($("<i></i>")).append($special);//.append($copySlice).append($pasteSlice);
*/



    var $activePen = undefined;
    //roiTool.checkForAnyActiveRoi();

    $("<div class='roiTool_panel_caption'></div>").appendTo($container);


    /***********************************************************
    * livepreview
    ************************************************************/
    var $livepreview;
    roiTool.livepreview = false;

    that.toggleLivePreview = function(val)
    {
      if (val != undefined)
        roiTool.livepreview = val;
      else
        roiTool.livepreview =!roiTool.livepreview ;
      if (roiTool.livepreview)
            $livepreview.addClass("fa-check-square").removeClass("fa-square")
      else
            $livepreview.removeClass("fa-check-square").addClass("fa-square")
    }
    var $livePrevRow = $("<div class='roiTool_panel_flex' ></div>").appendTo($container);
    $livePrevRow.append($("<div class='' >live preview</div>")).append( $("<i class='flexspacer'></i>") );
    var $livepreview = $("<i class='fa fa-square'></i>").click(function() {that.toggleLivePreview()}).appendTo($livePrevRow);
    that.toggleLivePreview( roiTool.livepreview )



    /***********************************************************
    * 4D mode
    ************************************************************/
    var $mode4DRow = $("<div class='roiTool_panel_flex' ></div>").appendTo($container);
    $mode4DRow.append($("<div class='' >4D mode</div>")).append( $("<i class='flexspacer'></i>") );
    var $mode4DButton = $("<i class='fa fa-square'></i>").appendTo($mode4DRow).click(function(){togglemode4D()});

    function togglemode4D(force)
    {
        roiTool.mode4D = force==undefined?(!roiTool.mode4D):force;
        if (roiTool.mode4D)
            $mode4DButton.addClass("fa-check-square").removeClass("fa-square")
        else
            $mode4DButton.removeClass("fa-check-square").addClass("fa-square")
    }



    /***********************************************************
    * outlines
    ************************************************************/
    that.toggleOutlines = function(val)
    {
      if (val != undefined)
        state.viewer.showOutlines = val;
      else
        state.viewer.showOutlines =!state.viewer.showOutlines ;
      if (state.viewer.showOutlines)
            $outlines.addClass("fa-check-square").removeClass("fa-square")
      else
            $outlines.removeClass("fa-check-square").addClass("fa-square")
      KViewer.iterateMedViewers(function(viewer)
      {
          for (var k = 0; k < viewer.ROIs.length; k++)
          {
             var obj = viewer.ROIs[k];
             if (state.viewer.showOutlines && obj.outlines == undefined)
             {
				obj.outlines = Outlines(obj)
			    obj.outlines.update(viewer);

             }
             if (!state.viewer.showOutlines && obj.outlines != undefined)             
			 {
			    obj.outlines.close();
				obj.outlines = undefined;
			 }
                
          }
      })

    }
    var $outlinesRow = $("<div class='roiTool_panel_flex' ></div>").appendTo($container);
    $outlinesRow.append($("<div class='' >outlines</div>")).append( $("<i class='flexspacer'></i>") );
    var $outlines = $("<i class='fa fa-square'></i>").click(function() {that.toggleOutlines()}).appendTo($outlinesRow);
    that.toggleOutlines( state.viewer.showOutlines )



    var $opacityRow = $("<div class='roiTool_panel_flex'>opacity</div>").appendTo($container);
    var $opacityinput = $(" <input type___ = 'number' min='0' max='100' value='" + (1-state.viewer.roiTransparency)+ "' /> ").on('change', function(ev) {

        state.viewer.roiTransparency = 1-parseFloat(ev.currentTarget.value);
        signalhandler.send("positionChange");

    });
    $opacityRow.append($("<i class='flexspacer'></i>")).append($opacityinput)


	KMouseSlider( $opacityinput, {min:0, max:1,incrementPerPixel: .01, logScaling:100 });




    /***********************************************************
    * ROI modes
    ************************************************************/
    $("<div class='roiTool_panel_caption'>MultiROI handling</div>").appendTo($container);
    var $roiModeRow = $("<div class='roiTool_panel_flex' ></div>").appendTo($container);
    $roiModeSelector = $("<select></select>");
    var roiModeList = [{"title":"Overlap","value":"overlap"},{ "title":"Override", "value":"override"}, { "title":"Block", "value":"block"}]
    // setting default value
    roiTool.roiMode = roiModeList[0].value;
    roiModeList.forEach(function (item) {
        $('<option>' + item.title + '</option>').val(item.value).appendTo($roiModeSelector)
    });
    $roiModeRow.append($("<div>")).append($roiModeSelector);
    $roiModeSelector.on('change', function (evt) {
        roiTool.roiMode = $roiModeSelector.val();
    });



    /***********************************************************
    * select pen
    ************************************************************/
    function selectPen(ev, pen)
    {
        var $whichbtn;
        if( pen != undefined)
        {
            if(pen == 'smartpaw')
                $whichbtn = $smartPenBtn;
            else if(pen == 'regionGrow')
                $whichbtn = $regionGrowPenBtn;
            else if(pen == 'regionGrowRestric')
                $whichbtn = $regionGrowPenBtnRestric;
            else
            {
                $whichbtn  = $();
                $activePen = undefined;
            }
        }
        else
        {
            $whichbtn = $(this);
        }
        // first, toggle everything always to false
        roiTool.$pencil.removeClass('leftright')
        $container.find('.RoiPen').removeClass('KViewPort_tool_enabled');
        polygonTool.disable();
        roiTool.smartpaw = false;
        roiTool.regionGrow = false;
        roiTool.regionGrowRestric = false;
        //roiTool.togglePen(false);

        if ($whichbtn.is($activePen) && pen == undefined)
        {
            // self click, disable all
            $activePen = undefined;
        }
        else
        {

            $activePen = $whichbtn;

            $whichbtn.addClass('KViewPort_tool_enabled');



            if ($whichbtn.is($smartPenBtn))
            {
                setThreshPen(undefined, 0);
                roiTool.smartpaw = true;
                roiTool.togglePen(true);
            }
            else if ($whichbtn.is($regionGrowPenBtn))
            {
                setThreshPen(undefined, 0);
                roiTool.regionGrow = true;
                roiTool.togglePen(true);
            }
            else if ($whichbtn.is($regionGrowPenBtnRestric))
           {
                setThreshPen(undefined, 0);
                roiTool.regionGrowRestric = true;
                roiTool.togglePen(true);
            }
          /*  else if ($whichbtn.is($polygonPenBtn))
            {
                polygonTool.enable(getParentViewer());
            }*/
        }

    }

    that.update = function()
    {
        var roi = roiTool.currentROI;
        if (roi != undefined)
        {
            var bgnd = that.getParentViewer().content;
            if (roi.content.edges._data.toString() == bgnd.content.edges._data.toString())
            {
                $regionGrowPenBtn.removeClass('inactive')
                $regionGrowPenBtnRestric.removeClass('inactive')
            }
            else
            {
                $regionGrowPenBtn.addClass('inactive')
                $regionGrowPenBtnRestric.addClass('inactive')
            }
        }
    }


    /***************************************************************************************
    * Remember the state of this tool
    ****************************************************************************************/
    that.getState  = function getState()
    {
        var s =
        {
            pencil:    roiTool.pencil,
            activePen: 0,
            threspen: roiTool.threspen,
            mode4D: roiTool.mode4D,
            roiMode: roiTool.roiMode
        };

        if(roiTool.smartPaw)
            s.activePen = 'smartPaw';
        else if(roiTool.regionGrow)
            s.activePen = 'regionGrow';
        else if(roiTool.regionGrowRestric)
            s.activePen = 'regionGrowRestric';


        return s;

    }

    /***************************************************************************************
    * generic state
    ****************************************************************************************/
    /*
    that.getGenericState  = function getGenericState()
    {
        var s =
        {
            pencil:    { radius:20, radius_z:4,   thres:100 },
            activePen: 0,
            threspen: 0,
        };
        return s;

    }
    */

    /***************************************************************************************
    * Set the state of this tool
    ****************************************************************************************/
    that.setState = function setState(snew)
    {

        // to be complete, first get the current state , then extend
        var s = that.getState();
        $.extend(true, s, snew);

        selectPen(undefined, s.activePen);
        setThreshPen(undefined, s.threspen);

        $inplaneradius.val( s.pencil.radius );
        $outplaneradius.val( s.pencil.radius_z );

        if(s.mode4D != undefined)
            togglemode4D(s.mode4D)

        if (s.roiMode != undefined)
        {
            $roiModeSelector.val(s.roiMode);
            roiTool.roiMode = s.roiMode;
        }
    }

    $container.find("input").on("dragstart", function(){return false});

    that.disable();
    return that;

}






/***************************************************************************************
* the polygon tool
****************************************************************************************/
KPolygonTool = function()
{

    var that = new Object();

    that.polygon = {};
    that.polygon.points = [];


    // representation of points in voxel coordinates
    var points = [];
    /*	points[0] = [20,20];
	points[1] = [20,50];
	points[2] = [50,50];*/


    var $svg;
    that.$svg = $svg;

    that.enabled = false;
    that.parent = undefined;
    /* parent viewport */

    var sigidp, sigidz;

    that.enable = function(parent)
    {
        that.enabled = true;
        that.parent = parent;
        sigidp = signalhandler.attach("positionChange", drawAllPoints);
        sigidz = signalhandler.attach("setZoom", drawAllPoints);
        that.createPolygon();
    }

    that.disable = function()
    {
        that.enabled = false;
        if (sigidp != undefined)
            signalhandler.detach("positionChange", sigidp);
        if (sigidz != undefined)
            signalhandler.detach("setZoom", sigidz);
        that.createPolygon();
    }


    that.clearPoints = function()
    {
        points = new Array();
        that.createPolygon();
    }


    // get points in linear fashion x,y ,x,y ...
    that.getPointsLinear = function()
    {
        var pointsLinear = [];
        for (var i = 0; i < points.length; i++)
        {
            pointsLinear[2 * i] = points[i][0];
            pointsLinear[2 * i + 1] = points[i][1];
        }
        return pointsLinear;
    }

    that.createPolygon = function()
    {

        // delete all svgs first
        $('.roiTool_svg').remove();

        if (!that.enabled)
            return


        var pstr = "";
        var cstr = "";
        var circleradius = 8;

        x_pixpvox = that.parent.$canvascontainer.width() / that.parent.$canvas.attr('width');
        y_pixpvox = that.parent.$canvascontainer.height() / that.parent.$canvas.attr('height');

        for (var i = 0; i < points.length; i++)
        {
            pstr = pstr + points[i][0] * x_pixpvox + "," + points[i][1] * y_pixpvox + " ";
            cstr = cstr + "<circle class='polygonCircle' ind =" + i + " cx=" + points[i][0] * x_pixpvox + " cy=" + points[i][1] * y_pixpvox + " r=" + circleradius + " stroke='green' stroke-width=" + 4 + " fill='' />";
        }
        var polyid = "KRoipolygon01";
        var childstr = "<polygon id='" + polyid + "' points='" + pstr + "' style='fill:none;'/>" + cstr;
        var defs = "<defs><filter id='svg_blur'>            <feGaussianBlur stdDeviation='2'' />        </filter>    </defs>";

        $svg = $("<div class='roiTool_svg'><svg  >" + defs + childstr + "</svg></div>").on("contextmenu", function(ev) {
            ev.preventDefault()
        }).appendTo(that.parent.$canvascontainer);


        if (points.length == 0)
        {
            $("<div class='roiTool_svgText'>Click to draw a polygon</div>").appendTo($svg);
        }
        else
        {
            $('.roiTool_svgText').remove();
        }

        // mouse handler for the svg object
        $svg[0].addEventListener("mousewheel", svgMouseScroll, false);
        // Firefox
        $svg.on('mousedown', svgMouseDown);


        // must find polygon and circles again in document tree node
        $svg.polygon = document.getElementById(polyid);
        $svg.circles = [];

        var polyCircles = $svg.find('.polygonCircle');
        for (var k = 0; k < points.length; k++)
        {
            polyCircles.eq(k).mousedown(mousedown).mouseover(mouseover).mouseout(mouseout).click(mouseclick).on("contextmenu", mouseclick);
            $svg.circles.push(polyCircles[k]);
        }


        // mouse handler for the single points
        function mouseover(ev) {
            ev.target.setAttribute('r', circleradius * 1.5);
        }
        function mouseout(ev) {
            ev.target.setAttribute('r', circleradius);
        }
        function mouseclick(ev)
        {
            // delete with right click
            if (ev.button == 2)
            {
                drawAllPoints();
                // needed of viewportLayout was changed;
                var ind = parseInt(this.getAttribute('ind'));
                points.splice(ind, 1);
                mouseup(ev);
                that.createPolygon();
            }
            ev.stopPropagation();
            return false;
        }

        function mousedown(ev, ev2)
        {
            if (ev2 !== undefined)
                ev = ev2;

            var pindex = parseInt(this.getAttribute('ind'));
            var startpos = [parseInt(this.getAttribute('cx')) - ev.clientX, parseInt(this.getAttribute('cy')) - ev.clientY];
            $(document).on("mousemove", function(ev) {
                mousemove(ev, pindex, startpos)
            });
            $(document).on("mouseup mouseleave", mouseup);
            ev.stopPropagation();
            return false;
        }

        function mousemove(ev, pindex, startpos)
        {

            var newX = startpos[0] + ev.clientX;
            var newY = startpos[1] + ev.clientY;

            // set the new point value
            points[pindex] = [newX / x_pixpvox, newY / y_pixpvox];

            drawPoint(pindex);

            ev.stopPropagation();
            return false;


        }

        function mouseup(ev)
        {
            $(document).off("mousemove");
            ev.stopPropagation();
            return false;
        }

    }



    function drawAllPoints()
    {
        x_pixpvox = that.parent.$canvascontainer.width() / that.parent.$canvas.attr('width');
        y_pixpvox = that.parent.$canvascontainer.height() / that.parent.$canvas.attr('height');

        for (var k = 0; k < points.length; k++)
        {
            drawPoint(k);
        }

    }



    function drawPoint(k)
    {
        $svg.circles[k].setAttribute('cx', points[k][0] * x_pixpvox);
        $svg.circles[k].setAttribute('cy', points[k][1] * y_pixpvox);
        $svg.polygon.points[k].x = points[k][0] * x_pixpvox;
        $svg.polygon.points[k].y = points[k][1] * y_pixpvox;
    }


    function svgMouseScroll(ev)
    {
        if (!ev.shiftKey)
        {
            return true;
        }

        var c = clientPosToPoint(ev);
        if (PolyK.ContainsPoint(that.getPointsLinear(), c[0], c[1]))
        {
            var sFac = math.sign( (ev.wheelDelta || -ev.detail ) ) * .1;
            if (ev.ctrlKey)
                sFac = sFac * .5;
            //console.log(sFac);
            for (var k = 0; k < points.length; k++)
            {
                points[k][0] = (1 + sFac) * (points[k][0] - c[0]) + c[0];
                points[k][1] = (1 + sFac) * (points[k][1] - c[1]) + c[1];
            }
            that.createPolygon();
            ev.preventDefault();
            ev.stopPropagation();
            return false;
        }

    }

    function svgMouseDown(ev)
    {
        if (ev.shiftKey | ev.ctrlKey)
        {
            return true;
        }

        if (ev.button == 0)
        {
            return addPointToClosestSegment(ev);
        }
        else if (ev.button == 2)
        {
            var startpos = [ev.clientX, ev.clientY];
            var pointsStarPos = $.extend(true, [], points);
            $(document).on("mousemove", function(ev) {
                mousemove(ev, startpos)
            });
            $(document).on("mouseup mouseleave", mouseup);
            ev.stopPropagation();
            return false;

            function mousemove(ev, startpos)
            {
                var newX = startpos[0] - ev.clientX;
                var newY = startpos[1] - ev.clientY;
                for (var k = 0; k < points.length; k++)
                {
                    points[k][0] = pointsStarPos[k][0] - newX / y_pixpvox;
                    points[k][1] = pointsStarPos[k][1] - newY / x_pixpvox;
                }

                drawAllPoints();
                ev.stopPropagation();
                return false;

            }
            function mouseup(ev)
            {
                $(document).off("mousemove");
                ev.stopPropagation();
                return false;
            }


        }

    }

    function clientPosToPoint(ev)
    {
        var py = (ev.clientY - $svg.offset().top) / y_pixpvox;
        var px = (ev.clientX - $svg.offset().left) / x_pixpvox;
        return [px, py];

    }


    /* add a new point to polygon */
    function addPointToClosestSegment(ev)
    {
        var p = clientPosToPoint(ev)
        var cl = PolyK.ClosestEdge(that.getPointsLinear(), p[0], p[1]);

        var newp = [p[0], p[1]];
        points.splice(cl.edge + 1, 0, newp);

        that.createPolygon();
        $($svg.circles[cl.edge + 1]).trigger('mousedown', ev);
        return false;
    }

    // add the polygon content to roi.
    that.modifyRoi = function(valtoset)
    {

        var medViewer = that.parent;

        if (medViewer.currentROI === undefined)
            return false;

        var nii = medViewer.currentROI.content;

        // transform canvas points to voxel space
        var ei = math.inv(nii.edges);
        var ox = $svg.offset().left;
        var oy = $svg.offset().top;

        var px = [];
        var py = [];

        for (var k = 0; k < points.length; k++)
        {
            px[k] = points[k][0];
            py[k] = points[k][1];
        }

        // get the bounding box in pixels
        var minX = Math.min.apply(null , px);
        var minY = Math.min.apply(null , py);
        var maxX = Math.max.apply(null , px);
        var maxY = Math.max.apply(null , py);

        var changedPoints = [];

        // iterate voxel space on canvas
        // this can be made much faster.
        var f = PolyK.ContainsPointFast(that.getPointsLinear());
        for (var x = minX; x < maxX; x += .8)
        {
            for (var y = minY; y < maxY; y += .8)
            {
                //var isin = PolyK.ContainsPoint(that.getPointsLinear(), x, y);
                var isin = f( x, y);
                if (isin)
                {
                    var cx = x * x_pixpvox + ox;
                    var cy = y * y_pixpvox + oy;
                    var pr = medViewer.getRealWorldCoordinatesFromMouseEvent(cx, cy);
                    var currentVoxel = math.round(math.multiply(ei, pr)._data);
                    var currentIndex = nii.sizes[0] * nii.sizes[1] * currentVoxel[2] + currentVoxel[1] * nii.sizes[0] + currentVoxel[0];
                    if (nii.data[currentIndex] != valtoset)
                        changedPoints.push(currentIndex);

                    nii.data[currentIndex] = valtoset;


                }
                //console.log(isin);
            }

        }

        if (valtoset != 2)
        {
            KViewer.roiTool.history.record('startRecording', medViewer);
            KViewer.roiTool.history.add(changedPoints, valtoset);
        }
          signalhandler.send("updateImage",{id:medViewer.currentROI.fileID});

        return;

    }
    return that;

}

var polygonTool = new KPolygonTool();







/*
		PolyK library
		url: http://polyk.ivank.net
		Released under MIT licence.

		Copyright (c) 2012 - 2014 Ivan Kuckir

		Permission is hereby granted, free of charge, to any person
		obtaining a copy of this software and associated documentation
		files (the "Software"), to deal in the Software without
		restriction, including without limitation the rights to use,
		copy, modify, merge, publish, distribute, sublicense, and/or sell
		copies of the Software, and to permit persons to whom the
		Software is furnished to do so, subject to the following
		conditions:

		The above copyright notice and this permission notice shall be
		included in all copies or substantial portions of the Software.

		THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
		EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
		OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
		NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
		HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
		WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
		FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
		OTHER DEALINGS IN THE SOFTWARE.

		19. 5. 2014 - Problem with slicing fixed.
	*/

var PolyK = {};

/*
		Is Polygon self-intersecting?

		O(n^2)
	*/

PolyK.IsSimple = function(p)
{
    var n = p.length >> 1;
    if (n < 4)
        return true;
    var a1 = new PolyK._P()
      , a2 = new PolyK._P();
    var b1 = new PolyK._P()
      , b2 = new PolyK._P();
    var c = new PolyK._P();

    for (var i = 0; i < n; i++)
    {
        a1.x = p[2 * i];
        a1.y = p[2 * i + 1];
        if (i == n - 1) {
            a2.x = p[0];
            a2.y = p[1];
        }
        else {
            a2.x = p[2 * i + 2];
            a2.y = p[2 * i + 3];
        }

        for (var j = 0; j < n; j++)
        {
            if (Math.abs(i - j) < 2)
                continue;
            if (j == n - 1 && i == 0)
                continue;
            if (i == n - 1 && j == 0)
                continue;

            b1.x = p[2 * j];
            b1.y = p[2 * j + 1];
            if (j == n - 1) {
                b2.x = p[0];
                b2.y = p[1];
            }
            else {
                b2.x = p[2 * j + 2];
                b2.y = p[2 * j + 3];
            }

            if (PolyK._GetLineIntersection(a1, a2, b1, b2, c) != null )
                return false;
        }
    }
    return true;
}

PolyK.IsConvex = function(p)
{
    if (p.length < 6)
        return true;
    var l = p.length - 4;
    for (var i = 0; i < l; i += 2)
        if (!PolyK._convex(p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]))
            return false;
    if (!PolyK._convex(p[l], p[l + 1], p[l + 2], p[l + 3], p[0], p[1]))
        return false;
    if (!PolyK._convex(p[l + 2], p[l + 3], p[0], p[1], p[2], p[3]))
        return false;
    return true;
}

PolyK.GetArea = function(p)
{
    if (p.length < 6)
        return 0;
    var l = p.length - 2;
    var sum = 0;
    for (var i = 0; i < l; i += 2)
        sum += (p[i + 2] - p[i]) * (p[i + 1] + p[i + 3]);
    sum += (p[0] - p[l]) * (p[l + 1] + p[1]);
    return -sum * 0.5;
}

PolyK.GetAABB = function(p)
{
    var minx = Infinity;
    var miny = Infinity;
    var maxx = -minx;
    var maxy = -miny;
    for (var i = 0; i < p.length; i += 2)
    {
        minx = Math.min(minx, p[i]);
        maxx = Math.max(maxx, p[i]);
        miny = Math.min(miny, p[i + 1]);
        maxy = Math.max(maxy, p[i + 1]);
    }
    return {
        x: minx,
        y: miny,
        width: maxx - minx,
        height: maxy - miny
    };
}

PolyK.Reverse = function(p)
{
    var np = [];
    for (var j = p.length - 2; j >= 0; j -= 2)
        np.push(p[j], p[j + 1])
    return np;
}


PolyK.Triangulate = function(p)
{
    var n = p.length >> 1;
    if (n < 3)
        return [];
    var tgs = [];
    var avl = [];
    for (var i = 0; i < n; i++)
        avl.push(i);

    var i = 0;
    var al = n;
    while (al > 3)
    {
        var i0 = avl[(i + 0) % al];
        var i1 = avl[(i + 1) % al];
        var i2 = avl[(i + 2) % al];

        var ax = p[2 * i0]
          , ay = p[2 * i0 + 1];
        var bx = p[2 * i1]
          , by = p[2 * i1 + 1];
        var cx = p[2 * i2]
          , cy = p[2 * i2 + 1];

        var earFound = false;
        if (PolyK._convex(ax, ay, bx, by, cx, cy))
        {
            earFound = true;
            for (var j = 0; j < al; j++)
            {
                var vi = avl[j];
                if (vi == i0 || vi == i1 || vi == i2)
                    continue;
                if (PolyK._PointInTriangle(p[2 * vi], p[2 * vi + 1], ax, ay, bx, by, cx, cy)) {
                    earFound = false;
                    break;
                }
            }
        }
        if (earFound)
        {
            tgs.push(i0, i1, i2);
            avl.splice((i + 1) % al, 1);
            al--;
            i = 0;
        }
        else if (i++ > 3 * al)
            break;
        // no convex angles :(
    }
    tgs.push(avl[0], avl[1], avl[2]);
    return tgs;
}

PolyK.ContainsPoint = function(pp, x, y)
{
    // close polygon
    pp.push(pp[0]);
    pp.push(pp[1]);
    var npoints = pp.length >> 1;
    var j = pp.length-2 ;
    var odd = false;
   
    
    for (var i=0; i<npoints*2; i+=2) 
    {
        if ((pp[i+1]< y && pp[j+1]>=y ||  pp[j+1]< y && pp[i+1]>=y)
            && (pp[i]<=x || pp[j]<=x)) 
        {
              odd ^= (pp[i] + (y-pp[i+1])*(pp[j]-pp[i])/(pp[j+1]-pp[i+1])) < x; 
        }
        j=i; 
    }

    return odd;
}


PolyK.ContainsPointFast = function(pp)
{

    // close polygon
    pp.push(pp[0]);
    pp.push(pp[1]);
    var npoints = pp.length >> 1;
    var j = pp.length-2 ;
    var constant = [];
    var multiple = [];
    for (var i = 0; i < npoints-1;i++)
    {
        constant.push(pp[2*i]-(pp[2*i+1]*pp[2*j])/(pp[2*j+1]-pp[2*i+1])+(pp[2*i+1]*pp[2*i])/(pp[2*j+1]-pp[2*i+1]))
        multiple.push((pp[2*j]-pp[2*i])/(pp[2*j+1]-pp[2*i+1]));
        j=i;
    }
    return function(x,y)
    {
      var oddNodes=false
      var current=pp[2*(npoints-1)+1]>y
      var previous;
      for (var i=0; i<npoints; i++) {
        previous=current; 
        current=pp[2*i+1]>y; 
        if (current!=previous) 
            oddNodes^=y*multiple[i]+constant[i]<x; 
      }
      return oddNodes; 
    }


} 








/* this one makes mistakes sometimes, use the one from above!  ...!*/
/* to be removed
PolyK.ContainsPoint__ = function(p, px, py)
{
    var n = p.length >> 1;
    var ax, ay = p[2 * n - 3] - py, bx = p[2 * n - 2] - px, by = p[2 * n - 1] - py;

    var lup = by > ay;
    for (var i = 0; i < n; i++)
    {
        ax = bx;
        ay = by;
        bx = p[2 * i] - px;
        by = p[2 * i + 1] - py;
        if (ay == by)
            continue;
        lup = by > ay;
    }

    var depth = 0;
    for (var i = 0; i < n; i++)
    {
        ax = bx;
        ay = by;
        bx = p[2 * i] - px;
        by = p[2 * i + 1] - py;
        if (ay < 0 && by < 0)
            continue;// both "up" or both "down"
        if (ay > 0 && by > 0)
            continue;// both "up" or both "down"
        if (ax < 0 && bx < 0)
            continue;// both points on the left

        if (ay == by && Math.min(ax, bx) <= 0)
            return true;
        if (ay == by)
            continue;

        var lx = ax + (bx - ax) * (-ay) / (by - ay);
        if (lx == 0)
            return true;
        // point on edge
        if (lx > 0)
            depth++;
        if (ay == 0 && lup && by > ay)
            depth--;
        // hit vertex, both up
        if (ay == 0 && !lup && by < ay)
            depth--;
        // hit vertex, both down
        lup = by > ay;
    }
    //console.log(depth);
    return (depth & 1) == 1;
}
*/ 

PolyK.Slice = function(p, ax, ay, bx, by)
{
    if (PolyK.ContainsPoint(p, ax, ay) || PolyK.ContainsPoint(p, bx, by))
        return [p.slice(0)];

    var a = new PolyK._P(ax,ay);
    var b = new PolyK._P(bx,by);
    var iscs = [];
    // intersections
    var ps = [];
    // points
    for (var i = 0; i < p.length; i += 2)
        ps.push(new PolyK._P(p[i],p[i + 1]));

    for (var i = 0; i < ps.length; i++)
    {
        var isc = new PolyK._P(0,0);
        isc = PolyK._GetLineIntersection(a, b, ps[i], ps[(i + 1) % ps.length], isc);
        var fisc = iscs[0];
        var lisc = iscs[iscs.length - 1];
        if (isc && (fisc == null || PolyK._P.dist(isc, fisc) > 1e-10) && (lisc == null || PolyK._P.dist(isc, lisc) > 1e-10)) //&& (isc.x!=ps[i].x || isc.y!=ps[i].y) )
        {
            isc.flag = true;
            iscs.push(isc);
            ps.splice(i + 1, 0, isc);
            i++;
        }
    }

    if (iscs.length < 2)
        return [p.slice(0)];
    var comp = function(u, v) {
        return PolyK._P.dist(a, u) - PolyK._P.dist(a, v);
    }
    iscs.sort(comp);

    //console.log("Intersections: "+iscs.length, JSON.stringify(iscs));

    var pgs = [];
    var dir = 0;
    while (iscs.length > 0)
    {
        var n = ps.length;
        var i0 = iscs[0];
        var i1 = iscs[1];
        //if(i0.x==i1.x && i0.y==i1.y) { iscs.splice(0,2); continue;}
        var ind0 = ps.indexOf(i0);
        var ind1 = ps.indexOf(i1);
        var solved = false;

        //console.log(i0, i1);

        if (PolyK._firstWithFlag(ps, ind0) == ind1)
            solved = true;
        else
        {
            i0 = iscs[1];
            i1 = iscs[0];
            ind0 = ps.indexOf(i0);
            ind1 = ps.indexOf(i1);
            if (PolyK._firstWithFlag(ps, ind0) == ind1)
                solved = true;
        }
        if (solved)
        {
            dir--;
            var pgn = PolyK._getPoints(ps, ind0, ind1);
            pgs.push(pgn);
            ps = PolyK._getPoints(ps, ind1, ind0);
            i0.flag = i1.flag = false;
            iscs.splice(0, 2);
            if (iscs.length == 0)
                pgs.push(ps);
        }
        else {
            dir++;
            iscs.reverse();
        }
        if (dir > 1)
            break;
    }
    var result = [];
    for (var i = 0; i < pgs.length; i++)
    {
        var pg = pgs[i];
        var npg = [];
        for (var j = 0; j < pg.length; j++)
            npg.push(pg[j].x, pg[j].y);
        result.push(npg);
    }
    return result;
}

PolyK.Raycast = function(p, x, y, dx, dy, isc)
{
    var l = p.length - 2;
    var tp = PolyK._tp;
    var a1 = tp[0]
      , a2 = tp[1]
      ,
    b1 = tp[2]
      , b2 = tp[3]
      , c = tp[4];
    a1.x = x;
    a1.y = y;
    a2.x = x + dx;
    a2.y = y + dy;

    if (isc == null )
        isc = {
            dist: 0,
            edge: 0,
            norm: {
                x: 0,
                y: 0
            },
            refl: {
                x: 0,
                y: 0
            }
        };
    isc.dist = Infinity;

    for (var i = 0; i < l; i += 2)
    {
        b1.x = p[i];
        b1.y = p[i + 1];
        b2.x = p[i + 2];
        b2.y = p[i + 3];
        var nisc = PolyK._RayLineIntersection(a1, a2, b1, b2, c);
        if (nisc)
            PolyK._updateISC(dx, dy, a1, b1, b2, c, i / 2, isc);
    }
    b1.x = b2.x;
    b1.y = b2.y;
    b2.x = p[0];
    b2.y = p[1];
    var nisc = PolyK._RayLineIntersection(a1, a2, b1, b2, c);
    if (nisc)
        PolyK._updateISC(dx, dy, a1, b1, b2, c, (p.length / 2) - 1, isc);

    return (isc.dist != Infinity) ? isc : null ;
}

PolyK.ClosestEdge = function(p, x, y, isc)
{
    var l = p.length - 2;
    var tp = PolyK._tp;
    var a1 = tp[0]
      ,
    b1 = tp[2]
      , b2 = tp[3]
      , c = tp[4];
    a1.x = x;
    a1.y = y;

    if (isc == null )
        isc = {
            dist: 0,
            edge: 0,
            point: {
                x: 0,
                y: 0
            },
            norm: {
                x: 0,
                y: 0
            }
        };
    isc.dist = Infinity;

    for (var i = 0; i < l; i += 2)
    {
        b1.x = p[i];
        b1.y = p[i + 1];
        b2.x = p[i + 2];
        b2.y = p[i + 3];
        PolyK._pointLineDist(a1, b1, b2, i >> 1, isc);
    }
    b1.x = b2.x;
    b1.y = b2.y;
    b2.x = p[0];
    b2.y = p[1];
    PolyK._pointLineDist(a1, b1, b2, l >> 1, isc);

    var idst = 1 / isc.dist;
    isc.norm.x = (x - isc.point.x) * idst;
    isc.norm.y = (y - isc.point.y) * idst;
    return isc;
}

PolyK._pointLineDist = function(p, a, b, edge, isc)
{
    var x = p.x
      , y = p.y
      , x1 = a.x
      , y1 = a.y
      , x2 = b.x
      , y2 = b.y;

    var A = x - x1;
    var B = y - y1;
    var C = x2 - x1;
    var D = y2 - y1;

    var dot = A * C + B * D;
    var len_sq = C * C + D * D;
    var param = dot / len_sq;

    var xx, yy;

    if (param < 0 || (x1 == x2 && y1 == y2)) {
        xx = x1;
        yy = y1;
    }
    else if (param > 1) {
        xx = x2;
        yy = y2;
    }
    else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    var dx = x - xx;
    var dy = y - yy;
    var dst = Math.sqrt(dx * dx + dy * dy);
    if (dst < isc.dist)
    {
        isc.dist = dst;
        isc.edge = edge;
        isc.point.x = xx;
        isc.point.y = yy;
    }
}

PolyK._updateISC = function(dx, dy, a1, b1, b2, c, edge, isc)
{
    var nrl = PolyK._P.dist(a1, c);
    if (nrl < isc.dist)
    {
        var ibl = 1 / PolyK._P.dist(b1, b2);
        var nx = -(b2.y - b1.y) * ibl;
        var ny = (b2.x - b1.x) * ibl;
        var ddot = 2 * (dx * nx + dy * ny);
        isc.dist = nrl;
        isc.norm.x = nx;
        isc.norm.y = ny;
        isc.refl.x = -ddot * nx + dx;
        isc.refl.y = -ddot * ny + dy;
        isc.edge = edge;
    }
}

PolyK._getPoints = function(ps, ind0, ind1)
{
    var n = ps.length;
    var nps = [];
    if (ind1 < ind0)
        ind1 += n;
    for (var i = ind0; i <= ind1; i++)
        nps.push(ps[i % n]);
    return nps;
}

PolyK._firstWithFlag = function(ps, ind)
{
    var n = ps.length;
    while (true)
    {
        ind = (ind + 1) % n;
        if (ps[ind].flag)
            return ind;
    }
}

PolyK._PointInTriangle = function(px, py, ax, ay, bx, by, cx, cy)
{
    var v0x = cx - ax;
    var v0y = cy - ay;
    var v1x = bx - ax;
    var v1y = by - ay;
    var v2x = px - ax;
    var v2y = py - ay;

    var dot00 = v0x * v0x + v0y * v0y;
    var dot01 = v0x * v1x + v0y * v1y;
    var dot02 = v0x * v2x + v0y * v2y;
    var dot11 = v1x * v1x + v1y * v1y;
    var dot12 = v1x * v2x + v1y * v2y;

    var invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    var u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    var v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    // Check if point is in triangle
    return (u >= 0) && (v >= 0) && (u + v < 1);
}

PolyK._RayLineIntersection = function(a1, a2, b1, b2, c)
{
    var dax = (a1.x - a2.x)
      , dbx = (b1.x - b2.x);
    var day = (a1.y - a2.y)
      , dby = (b1.y - b2.y);

    var Den = dax * dby - day * dbx;
    if (Den == 0)
        return null ;
    // parallel

    var A = (a1.x * a2.y - a1.y * a2.x);
    var B = (b1.x * b2.y - b1.y * b2.x);

    var I = c;
    var iDen = 1 / Den;
    I.x = (A * dbx - dax * B) * iDen;
    I.y = (A * dby - day * B) * iDen;

    if (!PolyK._InRect(I, b1, b2))
        return null ;
    if ((day > 0 && I.y > a1.y) || (day < 0 && I.y < a1.y))
        return null ;
    if ((dax > 0 && I.x > a1.x) || (dax < 0 && I.x < a1.x))
        return null ;
    return I;
}

PolyK._GetLineIntersection = function(a1, a2, b1, b2, c)
{
    var dax = (a1.x - a2.x)
      , dbx = (b1.x - b2.x);
    var day = (a1.y - a2.y)
      , dby = (b1.y - b2.y);

    var Den = dax * dby - day * dbx;
    if (Den == 0)
        return null ;
    // parallel

    var A = (a1.x * a2.y - a1.y * a2.x);
    var B = (b1.x * b2.y - b1.y * b2.x);

    var I = c;
    I.x = (A * dbx - dax * B) / Den;
    I.y = (A * dby - day * B) / Den;

    if (PolyK._InRect(I, a1, a2) && PolyK._InRect(I, b1, b2))
        return I;
    return null ;
}

PolyK._InRect = function(a, b, c) // a in rect (b,c)
{
    var minx = Math.min(b.x, c.x)
      , maxx = Math.max(b.x, c.x);
    var miny = Math.min(b.y, c.y)
      , maxy = Math.max(b.y, c.y);

    if (minx == maxx)
        return ( miny <= a.y && a.y <= maxy) ;
    if (miny == maxy)
        return ( minx <= a.x && a.x <= maxx) ;

    //return (minx <= a.x && a.x <= maxx && miny <= a.y && a.y <= maxy)
    return ( minx <= a.x + 1e-10 && a.x - 1e-10 <= maxx && miny <= a.y + 1e-10 && a.y - 1e-10 <= maxy) ;
}

PolyK._convex = function(ax, ay, bx, by, cx, cy)
{
    return (ay - by) * (cx - bx) + (bx - ax) * (cy - by) >= 0;
}

PolyK._P = function(x, y)
{
    this.x = x;
    this.y = y;
    this.flag = false;
}
PolyK._P.prototype.toString = function()
{
    return "Point [" + this.x + ", " + this.y + "]";
}
PolyK._P.dist = function(a, b)
{
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}

PolyK._tp = [];
for (var i = 0; i < 10; i++)
    PolyK._tp.push(new PolyK._P(0,0));




/********************************************************************
midplane
********************************************************************/

function mirror_roi(fobj, dim)
{

    /*****************************
	get the nifti
	*****************************/
    fobj = fobj || KViewer.roiTool.getCurrentGlobal();
    if(!fobj || !fobj.content)
    {
        alertify.error("No roi selected");
        return;
    }
    var nii =  fobj.content;



    if (dim == undefined)
    {
        alertify.error("No option selected!");
    }
    else if(dim == 'C')
    {
        var mset = markerProxy.getSetByName('midplane')
        //var mset = markerProxy.markersets._midplane_
        if(!mset)
        {
            alertify.confirm("Need a midplane for this operation. Do you want to create one? If yes, draw 2 or 3 points to define midplane, then re-run.<br>You can also save the midline for later use.", 
            function(e, name) {
                if (e)
                   KMarkerPanel_midplane()
            });
        }
        else if(Object.getOwnPropertyNames(mset.markerpoints).lengh <3)
        {
             alertify.error("not enough points defined for midplane!");
        }
        else
        {
            run();
        }
    }
    else
    {
        run();
    }


	


	/*****************************
	create plane n,c from the first three points of markerset
	*****************************/
	function run()
	{
	    if(dim == 'C')
	    {
            var mset = markerProxy.getSets()[0];
            var points = mset.markerpoints;

            var x = [];
            var count = 0;
            for(var k in points)
            {
                count++;
                if(count <= 3)
                    x.push(points[k].p.coords);
                else
                    break
            }


            // if only two points defined, take plane normal vector of current image
            if(x.length < 3)
            {
                if(KViewer.viewports[0].medViewer == undefined || KViewer.viewports[0].medViewer.nii == undefined)
                {
                     alertify.error("not enough points defined for midplane!");
                     return;
                }
                else
                {
                    var u = KViewer.viewports[0].medViewer.nii.spaceDirections[ KViewer.viewports[0].medViewer.getSlicingDimOfArray() ] ;
                    x.push( math.add(x[0], u )._data );
                }
            }

            // account for minus c in plane dist calulation here
            var c = math.multiply(x[0], -1);
            var n = math.cross( math.add(x[1], math.multiply(x[0],-1)), math.add(x[2], math.multiply(x[0],-1)));
            n = math.multiply(n, 1/math.norm(n))._data;
	    }
	    else
	    {
            
            var n;
            if(dim == 'X')
                dd = 0;
            else if(dim == 'Y')
                dd = 1;
            else if(dim == 'Z')
                dd = 2;
            var c = KViewer.currentPoint;
            
            // not completely sure, 
            n = nii.spaceDirections[ nii.invPermOrder[dd] ];
            n = math.multiply(n, 1/math.norm(n))._data;
            n.push(0);
           
            // account for minus c in plane dist calulation here
            c = math.multiply( kmath.multiply(KViewer.reorientationMatrix.matrix, c), -1)._data.slice(0,3);
            n = kmath.multiply(KViewer.reorientationMatrix.matrix, n)._data.slice(0,3);
            console.log("mirroring along c, n: " + c + " | " + n)
	    }

		/*****************************
		prepare and run over array
		must run in sub-steps in order to avoid artifacts
		*****************************/
		var mode = "newroi"

		if(mode=="newroi")
		{
			var name =  fobj.filename.replace(/\.nii$|\.nii\.gz$/) + "_mirr"

			KViewer.roiTool.pushROI(fobj.fileID, name, "lower0.0",
				function arrived(fobj)
				{
					KViewer.iterateMedViewers(function(m) {
						if (m.nii !== undefined)
							m.viewport.setContent(fobj, { intent: { ROI: true } });
					})
					//KViewer.roiTool.makeCurrentGlobal(fobj.fileID);
					doit(nii, fobj.content)


				});

		}
		else
		{
			doit(nii, nii)
		}

		function doit(nii, nii_mirrored)
		{
		
			var siz = nii.sizes;
			var eE  = nii.edges;
			var iE  = math.inv(nii.edges);
			var widheidep = siz[0]*siz[1]*siz[2];

			var currentTimePoint = nii.currentTimePoint.t;

			var x, y, z, p, ind, dist
			var step = 1;
			//var pointsToAdd = [];
			for(var z=0; z<siz[2]; z+=step)
			{
				for(var y=0; y<siz[1]; y+=step)
				{
					for(var x=0; x<siz[0]; x+=step)
					{
						ind = siz[0]*siz[1]*z + siz[0]*y + x + widheidep*(currentTimePoint);
						if(nii.data[ind] > 0)
						{
							// must do some sub-sampling here ...
							var tt = 2;
							var nn =tt +.5
							for(var u=0; u<tt; u++)
							{
								for(var v=0; v<tt; v++)
								{
									for(var j=0; j<tt; j++)
									{
										p = math.multiply(eE, [x+u/nn, y+v/nn, z+j/nn, 1])._data.slice(0,3);
										dist = math.dot(n,  math.add(p,c ));
										p = math.add(p, math.multiply(n, -2*dist))._data;
										p = math.round( math.multiply(iE, [p[0],p[1],p[2],1])._data );
										if( p[0] < nii.sizes[0] && p[1] < nii.sizes[1] && p[2] < nii.sizes[2] && p[0] >=0  && p[1] >=0 && p[2] >=0 )
										{
                                            ind = siz[0]*siz[1]*p[2] + siz[0]*p[1] + p[0] + widheidep*(currentTimePoint);
                                            nii_mirrored.data[ind] = 1;
										}
									}
								}
							}
						}
					}
				}
			}

// 			for(var k=0, len=pointsToAdd.length;  k<len; k++)
// 				nii_mirrored.data[pointsToAdd[k]] = 1;
		}
	}


	
/*
For the worker, to be implemented
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

*/

}
