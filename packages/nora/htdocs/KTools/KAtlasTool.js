
   
// ======================================================================================
// ======================================================================================
// ============= KAtlasTool
// ======================================================================================
// ======================================================================================


function KAtlasTool(master)
{
  /** the atlas tool
   * @class 
   * @alias KAtlasTool
   * @augments KToolWindow
   */
  var that = new KToolWindow(master,
  $("<div class='KView_tool '><i class='fa fa-cubes fa-1x'></i></div>")
  .append( $("<ul ></ul>").append($("<li><a>Atlas</a></li>")) ) );
  var fibertool = master.obj3dTool;

  that.name = 'Atlas';
  that.point = master.currentPoint;
  
  that.$topRow.addClass("AtlasTool_topmenu")
  
  // the list of 3D objects as key/value pairs
  that.objs = {};
  var atlass = that.objs;

  // the top menu
  var $menu = $("<ul></ul>");
  if (static_info != undefined) if (static_info.atlas != undefined)
  {
 	  var subfolder = {};
	  for (var k = 0; k < static_info.atlas.available.length;k++)
	  	if (static_info.atlas.available[k].Tag.search("atlas")>-1)
	  	{
			var subname;	  		
	  		if (static_info.atlas.available[k].SubFolder != "")
	  			subname = static_info.atlas.available[k].SubFolder;
	  	    else
	  	    	subname = 'root';
		    if (subfolder[subname] == undefined)
		    	subfolder[subname] = [];
		    subfolder[subname].push(static_info.atlas.available[k]);

	  	}
	  for (var subs in subfolder)
	  {
	  	var $menuhead = $("<li><a> <span>"+subs+" </span><i class='fa fa-caret-right'></i></a></li>").appendTo($menu);
    	var $submenu = $("<ul></ul>").appendTo($menuhead);
    		   
	    var items = subfolder[subs];
	    for (var k = 0; k < items.length;k++)
	    {
	      new function() {
	      	var item = items[k];
			if (item.Tag.search("atlas")>-1)
			{
				var name = item.Filename.replace(".nii","");
				var id = item.ID;
				$("<li><a>"+name+"</a></li>").click(function(){
					KViewer.dataManager.loadData({URLtype:'serverfile', fileID:id, json:{project:static_info.atlas.project},
							progressSpinner:that.progressSpinner,
							callback: function(fobj)
								{  
								   that.progressSpinner();
								   fobj.project = static_info.atlas.project;
								   that.addAtlas(fobj);
								   that.update();
								   KViewer.dataManager.setFile(fobj.fileID,fobj);
								   KViewer.cacheManager.update();
								}});
					}).appendTo($submenu);
			} } 
	    }
	  }
  }
  that.$topRow.append( $("<li><a>Atlas</a></li>").append($menu) );

  // that tool table 
  var $innerDIV = $("<div ondragover='event.preventDefault();' class='annotation_tool_listDIV'></div>").appendTo(that.$container);

  var $table = $("<table  class='localfiletable'></table>").appendTo($innerDIV);
  $("<div><br></div>").appendTo($innerDIV);
  var $deffield = $("<table  class='localfiletable'></table>").appendTo($innerDIV);


  
  var colors = [[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255]];


  function extendBySlicerTXT(fobj,dest)
  {
		var labels = {};
		var data = fobj.content.split(/\r?\n/);
		for (var j = 0; j < data.length;j++)
		{
			var line = data[j].trim();
			if (line[0] == '#') continue;
			var lab = $(line.split(/[ \t]/)).not([""]);
			if (isNaN(parseInt(lab[0])))
				continue;
		    var col = [parseInt(lab[2]),parseInt(lab[3]),parseInt(lab[4])];
		    if (isNaN(col[0]) | isNaN(col[1]) | isNaN(col[2]))
		    	col = colors[Object.keys(that.objs).length%colors.length];
			labels[lab[0]] = {key:parseInt(lab[0]), name: lab[1], color:  col};

		}
		dest.content.labels = labels;
  }




  // load atlas from drop into tool
  function loadFromDrop(handler)
  {
  	return function(e)
    {
		e.preventDefault();
		e.stopPropagation();
		var params = getloadParamsFromDrop(e.originalEvent,undefined);
		/*if (params.length > 2)
		{
  	       loadingQueue.execQueue(params, function (fobjs) 
  	       { 
			  var fileObject =  cloneNifti(fobjs[0],"atlas1","uint16");
			  fileObject.fileID = "atlas111";
			  fileObject.filename += ".nii";
			  fileObject.fileinfo.Tag = "/atlas/";
			  var tot = fileObject.content.sizes[0]*fileObject.content.sizes[1]*fileObject.content.sizes[2]
			  for (var k = 0; k < fileObject.content.sizes;k++)
			  {
			  	 if (fobjs[0].content.data[k]>0)
			  	 	fileObject.content.data[k] = 1;
			  	 else
			  	 	fileObject.content.data[k] = 0;

			  }


			  KViewer.dataManager.setFile(fileObject.fileID,fileObject);
			  that.addAtlas(fileObject); 

  	       } );


		}
		else */
		if (params.length == 2)
		{
		   var p1 = params[0].fileID;
		   var p2 = params[1].fileID;
  	       loadingQueue.execQueue(params, function () 
  	       { 
  	       		p1 = master.dataManager.getFile(p1);
  	       		p2 = master.dataManager.getFile(p2);
				if (p1.contentType == 'txt' & p2.contentType == 'nii')
				{
					 that.addAtlas(p2); 
					 extendBySlicerTXT(p1,p2);
					 that.update();
				}
				else if (p2.contentType == 'txt' & p1.contentType == 'nii')
				{
					 that.addAtlas(p1); 
					 extendBySlicerTXT(p2,p1);
					 that.update();
				}
				else
					alertify.error("Select a text and a nifti file for atlas drop");
		
  	       } );

		}
		else if (params.length > 0)
		{
			params[0].progressSpinner = that.progressSpinner;
			params[0].callback = function(imageStruct)
			{
				handler(imageStruct,e);
				that.hideSpinner();
			}
			that.progressSpinner("Retrieving Data");
			master.dataManager.loadData(params[0]);
		}
  	};
  }



  // resize handler
  that.resize = function(hei)
  {
      that.$container.height(hei);
      $innerDIV.height(hei-that.$container.find('.KToolsTopMenu').height());
      
  }


  /***************************************************************************************
   *  object management
   ****************************************************************************************/

 
  that.addAtlas = function (fobj)
  {
       if (fobj.contentType == 'nii')
       {
		   if (!that.enabled)
			  that.show();
		   if (fobj.content.sizes[3] == 3 | fobj.content.sizes[4] == 3)
		   {
			  that.defField = fobj;
		   }
		   else
		   {
		   	   if (that.objs[fobj.fileID] != undefined)
					return that.objs[fobj.fileID];
			   that.objs[fobj.fileID] = fobj;
			   fobj.content.alpha = 0.7;
			   if ( fobj.content.extension != undefined &&  fobj.content.labels == undefined)
			   {
				   var labelshtml = fobj.content.extension.content.getElementsByTagName('Label');
				   var labels = {};
				   for (var k = 0; k < labelshtml.length;k++)
				   {
						var x = labelshtml[k];
						var col = math.round([255*parseFloat(x.getAttribute('Red')),255*parseFloat(x.getAttribute('Green')),255*parseFloat(x.getAttribute('Blue'))]);
						labels[x.getAttribute('Key')] =  { key:x.getAttribute('Key'),name:x.textContent, color:col  };
				   }
				   fobj.content.labels = labels;
			   }
			   else if ((fobj.filename.search("\\.mgz") > -1 || fobj.filename.search("\\.mgh") > -1) &&  fobj.content.labels == undefined)
			   {
			   		fobj.content.labels = static_info.FSLUT;
			   }
			   else
			   {

			   }
			   computeBBoxes(fobj.content);
		   }
		   signalhandler.send('positionChange');
       }

       return fobj;
  }
 
  // drop handler 
  that.$container.on("drop",loadFromDrop(that.addAtlas));



  that.clearAll = function ()
  {
      var obs = Object.keys(that.objs);
      for (var k = 0; k< obs.length;k++)
      		delete that.objs[obs[k]].content;
      that.objs = {};
      atlass = that.objs;
	  that.update();
  }


  /***************************************************************************************
   *  table updater 
   ****************************************************************************************/

  that.update = function()
  {
    $table.children().remove();
    $deffield.children().remove();



	var $wrap = $("<div>").appendTo($deffield);
    var $row = $("<tr ><td> Template mapping (iy)</td></tr>").appendTo($wrap);
    var $row = $("<tr ></tr>").appendTo($wrap);
	if (that.defField != undefined)
	{
	     $row.append($("<td> "+that.defField.filename +" </td>"));

	     that.$mnicoord = $("<td> </td>");
		 var def = that.defField.content;
		 var p = math.multiply(math.inv(def.edges),KViewer.currentPoint)._data;	   	  
		 var str = [];
		 var diag =math.diag([1,1,1,1])._data;
		 for (var j=0;j<3;j++ )
		 {
		 	var tmp = trilinInterp(def,p[0],p[1],p[2],diag,def.sizes[0]*def.sizes[1]*def.sizes[2]*j);
		 	if (tmp != undefined)
		        str[j] = trilinInterp(def,p[0],p[1],p[2],diag,def.sizes[0]*def.sizes[1]*def.sizes[2]*j).toFixed(1);
		    else
		        str[j] = "?";
		 }
		 str = "(" + str.join(",") + ")";
		 that.$mnicoord.text(str);

	     $row.append(that.$mnicoord);
         $row.append($("<td> <i class='fa  fa-close'></td>").click(function() { that.defField = undefined;  signalhandler.send('positionChange'); } ));
	}
	else	
	     $row.append($("<td> none </td>"));



	var $thead = $("<thead>").appendTo($table);
    var $row = $("<tr ></tr>").appendTo($thead);
    $row.append($("<td class='fixedwidth' fixedwidth='6'><i class='fa fa-fw fa-square-o'></i> </td>"));
    $row.append($("<td>Atlas  </td>"));
    $row.append($("<td class='fixedwidth' fixedwidth='6'>  </td>"));
    $row.append($("<td class='fixedwidth' fixedwidth='6'>  </td>"));
		
    if (Object.keys(that.objs).length == 0)
    {
    	$table.append($("<span> select an atlas from menu or drop a custom one </span>"));
    }

	var $tbody = $("<tbody>").appendTo($table);
    for  (var k in that.objs)
    {
	   var id = that.objs[k].fileID;

	   
       function drophandler(fobj,dropevent)
       {			
			if (fobj.contentType == 'txt')
			{
		 		extendBySlicerTXT(fobj,that.objs[k]);
				that.update();
			}
			else
				that.addAtlas(fobj);
       }
       var dragstuff = "draggable='true' data-type='file' data-mime='nii' data-tag='/atlas/' data-fileID='"+that.objs[k].fileID+"' data-filename='"+that.objs[k].filename+"' ";
       dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";

	   var nii = that.objs[k].content;

       var $row = $("<tr " + dragstuff + "></tr>").appendTo($tbody).on("drop",loadFromDrop(drophandler));
       $row.append($("<td><i class='fa fa-fw fa-square-o'></i> </td>").click(function(e){ toggle_file(e.target); return false; }));      
       $row.on("contextmenu", function (ev) { formContextMenu(ev); });
       if (nii.labels != undefined)
       		$row.append($("<td >" + that.objs[k].filename + "</td>"));
       else
       		$row.append($("<td >" + that.objs[k].filename + " (no label info) </td>"));
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-wrench'></td>").click(function(k_) { return function() { 
		   if (that.objs[k_].panel == undefined)
				that.objs[k_].panel = KAtlasPanel(that.objs[k_]);
			else
				that.objs[k_].panel.toggle();
			} }(k) ));
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-close'></td>").click(function(k_) { return function() { delete that.objs[k_]; that.update(); } }(k) ));

       var $row = $("<tr " + dragstuff + "></tr>").appendTo($table).on("drop",loadFromDrop(drophandler));

	   var key = 0;
	   var point = that.point;

	   if (that.defField != undefined)
	   {
	   	   var ps = [0,0,0,1];
	   	   var def = that.defField.content;
 	       var p = math.multiply(math.inv(def.edges),point)._data;	   	  
 	       var diag =math.diag([1,1,1,1])._data;
		   for (var j=0;j<3;j++ )
               ps[j] = trilinInterp(def,p[0],p[1],p[2],diag,def.sizes[0]*def.sizes[1]*def.sizes[2]*j);
           if (ps[0] != undefined & ps[0] != undefined & ps[0] != undefined)
           {
			   ps =math.round(math.multiply(math.inv(nii.edges),ps)._data);
			   key = nii.data[nii.sizes[0]*nii.sizes[1]*ps[2] + ps[1]*nii.sizes[0] + ps[0]];
           }
	   }
	   else
	   {
  	       var einv = math.inv(nii.edges);
 	       var p = math.round(math.multiply(einv,point)._data);
	       if (p[0] != undefined & p[0] != undefined & p[0] != undefined)
           {
		 	   key = nii.data[nii.sizes[0]*nii.sizes[1]*p[2] + p[1]*nii.sizes[0] + p[0]];
           }
	   }
	   if (nii.labels != undefined)	   
	   {
		   var label = nii.labels[key];
		   if (label != undefined)
		   {
			   $row.append($("<td style='background-color:"+RGB2HTML(label.color[0],label.color[1],label.color[2])+";'  ></td>"));
			   $row.append($("<td > " + label.name + " (" + key + ")</td>"));
			   that.objs[k].currentLabel = nii.labels[key]; 
		   }
		   else
		   {
		       $row.append($("<td></td>"));
  		       $row.append($("<td > key=" + key + " (undefined)</td>"));
			   that.objs[k].currentLabel =  {key:-1, name:"undefined", color:[255,0,0]};	  
		   }

	   }
	   else
	   {
		   $row.append($("<td></td>"));
		   $row.append($("<td > key=" + key + "</td>"));
		   var idx = (parseInt(key)*32)%256;
		   var col = [KColormap.jet[0][idx],KColormap.jet[1][idx],KColormap.jet[2][idx]];
		   that.objs[k].currentLabel = {key:key, name:"key="+key, color:col};	   	   
	   }       

	   if (that.objs[k].panel)
	   {
			that.objs[k].panel.setCurrentLabel( that.objs[k].currentLabel.key,true);

	   }

    }     
    that.attachTableOperator($table.parent());
   
  }

  that.update();
  that.updatePoint = function()
  {
		that.point = master.currentPoint;
		that.update();
		

  }

  signalhandler.attach('positionChange',function()
  {
	if (master.crosshairMode)  	
  	 	that.updatePoint();
  });
  

  function computeBBoxes(atlas_nii)
  {
      	var bboxes = {}
        var max = [-100000, -100000, -100000];
        var min = [100000, 100000, 100000];

        var edges = atlas_nii.edges;
        var e = edges._data;
        var sz = atlas_nii.sizes;
        for (var z = 0; z < sz[2]; z++)
            for (var y = 0; y < sz[1]; y++)
                for (var x = 0; x < sz[0]; x++)
                {
                	var key = atlas_nii.data[sz[0] * sz[1] * z + sz[0] * y + x];
                    if (key > 0)
                    {
                    	var b = bboxes[key];
                    	if (b == undefined)
                    	{
                    		b = { max: [-100000, -100000, -100000],  min:[100000, 100000, 100000]};
                    		bboxes[key] = b;
                    	}
                        //var p = math.multiply(edges, [x, y, z, 1]);
                       	var X = e[0][0]*x + e[0][1]*y +e[0][2]*z + e[0][3];
                       	var Y = e[1][0]*x + e[1][1]*y +e[1][2]*z + e[1][3];
                       	var Z = e[2][0]*x + e[2][1]*y +e[2][2]*z + e[2][3];
                        if (b.max[0] < X)
                            b.max[0] = X;
                        if (b.min[0] > X)
                            b.min[0] = X;
                        if (b.max[1] < Y)
                            b.max[1] = Y;
                        if (b.min[1] > Y)
                            b.min[1] = Y;
                        if (b.max[2] < Z)
                            b.max[2] = Z;
                        if (b.min[2] > Z)
                            b.min[2] = Z;
                    }
                }
		if (atlas_nii.labels != undefined)
			for (var k in atlas_nii.labels)
			{
				atlas_nii.labels[k].bbox = bboxes[k];
			}
		else
		{
			atlas_nii.labels = {};
			for (var k in bboxes)
			{
			    var idx = (parseInt(k)*32)%256;
			    var col = [KColormap.jet[0][idx],KColormap.jet[1][idx],KColormap.jet[2][idx]];
				
				atlas_nii.labels[k] = {bbox:bboxes[k], key:k , name:"key="+k , color:col}
			}

		}
		return;



  }






		function ready4Clone(x,withbuffer)
		{
			if (x != undefined)
			{
			   var res = {data:x.data,
						sizes:x.sizes,
						edges:x.edges,
						wid:x.wid,
						widhei:x.widhei,
						widheidep:x.widheidep,
						detsign:x.detsign};
			   if (withbuffer)
				  res.buffer = x.buffer;
			   return res;
			}
			else
				return undefined;
		}




		function renderROIfromLabel(obj,fobj,val,done)
		{
			if (val == undefined)
				val = 1;
			else if (Array.isArray(val))
			{
				var labs = {};
				for (var k = 0;k < val.length;k++)
					labs[val[k]] = true;
				val = labs;
			}

			var img = fobj.content;


			that.progressSpinner("rendering volume");

			var deffield;
			if (that.defField)
			{
				deffield = that.defField.content;
				fobj.fileinfo.patients_id = that.defField.fileinfo.patients_id;
				fobj.fileinfo.studies_id = that.defField.fileinfo.studies_id;
			}
			else
			{
				if (typeof patientTableMirror != "undefined")
				{
					var finfo = patientTableMirror.getCurrentUniquePSID();
					if (finfo != false)
						fobj.fileinfo = $.extend(fobj.fileinfo, finfo);
					else
					{
						fobj.fileinfo.patients_id =undefined;
						fobj.fileinfo.studies_id = undefined;
					}
				}
			}

			executeImageWorker({func:'atlasToRoi', 
						   atlas:ready4Clone(obj.content),
						   deffield:ready4Clone(deffield),
						   img:ready4Clone(img,true), key:val },[img.buffer],that.progressSpinner,
				function(e)
				{
					fobj.content = prepareMedicalImageData(parse(e.execObj.buffer), fobj);
					done(fobj);
					KViewer.cacheManager.update();
					KViewer.roiTool.update();
				}
				);
		}



		function createISOfromLabel(atlas,label,ondone)
		{


					var tmp_label = {name:label.name,key:label.key};
					if (that.defField != undefined)
					{
						that.progressSpinner("rendering isosurface");
						var tmp = cloneNifti(that.defField,'tmp','uint8');
						renderROIfromLabel(atlas,tmp,parseInt(label.key),function()
						{	
							KViewer.obj3dTool.createSurfaceFromAtlas(tmp, undefined, function(fobj)
							{ 
								label.surfacereference = fobj;
								if (ondone) ondone(fobj) 
							});

						});
					}			
					else
					{

							if (label.surfacereference == undefined)
								KViewer.obj3dTool.createSurfaceFromAtlas(atlas, tmp_label ,function(fobj)
								{ 
									label.surfacereference = tmp_label.surfacereference;
									if (ondone) ondone(fobj)
								 });
							else
								if (ondone) ondone(label.surfacereference)
					}					

		}
			






	that.createISOfromLabel = createISOfromLabel;
	that.renderROIfromLabel = renderROIfromLabel;





	that.attachSurf= function(atlas,label,viewer) 
	{ attachSurfaceRef(atlas,label,function()
		{
			 loadSurfIntoViewport(label,viewer);
		}); 
	}



	that.attachSurfaceRef  = attachSurfaceRef;
	function attachSurfaceRef(atlas,label,cb)
	{
		createISOfromLabel(atlas,label, function(fobj) { 
			label.surfacereference = fobj;
			fobj.atlasref = {atlas:atlas,label:label.key};				
			if (cb)
				cb();

		});
	}




		function loadSurfIntoViewport(label,viewer)
		{

			if (viewer == undefined)
			{
				return;
			}
			function append() {
				var alreadyInVP = false;
				for (var k = 0; k < viewer.objects3D.length; k++)
					if (label.surfacereference == viewer.objects3D[k].surf)
					{
						alreadyInVP = true;
						break;
					}
				if (!alreadyInVP)
				{
					var surfView = viewer.appendObject3D(label.surfacereference , {
						color:   label.color
					});
				}
			}
			if (!viewer.isGLenabled())
				viewer.toggle3D(undefined, append);
			else
				append();
		}






	that.getROIfromSinglelabel = function(atlas,key,name,bgndcontrast,callback,progress)
	{
	 	  var fid = "ROI_ATLAS_" + atlas.fileID + "_" +key;
		  var roi = KViewer.dataManager.getFile(fid);
		  if (roi != undefined)
			callback(roi);
		  else
		  {
				bgndcontrast.intendedROIid = fid;	                                         	
				master.roiTool.pushROI(bgndcontrast.fileID,name,undefined,function(roi)
				{          			  	  
					 progress("rendering ROI");
					 renderROIfromLabel(atlas,roi,parseInt(key),function()
					 {
						 callback(roi);
						 progress();
					 });

				},progress);
		  }
	}



  /***************************************************************************************
  * create ATLAS subview
  ***************************************************************************************/  

  that.createView  = function(fobj,viewer,intent)
	{
		var viewer = viewer;
		var obj = { atlas:fobj,
					nii:fobj.content,
		            type:'atlas',
					color:0	};


	   /***************************************************************************************
		* the subviews toolbar
		****************************************************************************************/  
		var $captiondiv,$dragdiv,$createIso,$createOutlines;
		obj.divs = [ $("<br style='clear:both' />"),
					 $("<div  class='KViewPort_tool atlas persistent'>  <i class='fa fa-close fa-1x'></i></div>").click( close  ).mousedown(viewer.viewport.closeContextMenu(obj)),
					 $createIso = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-1x'><span>3D</span></i></div>").appendTooltip("isosurfatlas"),
                     $createOutlines = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-1x'><span>outline</span></i></div>").appendTooltip("isosurfatlas").hide(),
                     $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-pencil fa-1x'> </div>")
          			 .click(function(viewer) { return function() { 

						that.getROIfromSinglelabel(obj.atlas,obj.atlas.currentLabel.key,obj.atlas.currentLabel.name,viewer.content,
								function(roi) { viewer.viewport.setContent(roi,{}) },viewer.viewport.progressSpinner);


          			   }}(viewer)),
  					 $captiondiv = $("<div  class='KViewPort_tool atlas caption' contenteditable='true'> "+obj.atlas.filename+"</div>"),
					 $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>")
				   ];


		$dragdiv.attr("draggable",'true');
		$dragdiv.on("dragstart", dragstarter({ type:'file', tag: '/mask/', mime: 'nii', filename: obj.atlas.filename, intent:'atlas:true', close:close,fileID: obj.atlas.fileID }));

		viewer.toolbar.append(obj.divs,'atlas');

		function update()
		{	
			if (obj.atlas.currentLabel != undefined)
				$captiondiv.text(obj.atlas.currentLabel.name); 			
		}
        obj.updateid = signalhandler.attach('labelChange',update);
        obj.updateid = signalhandler.attach('positionChange',update);


		$createOutlines.click(function(ev) {
			if (obj.outlines == undefined)
				obj.outlines = Outlines(obj)
			obj.outlines.update(viewer);

		});




        if(state.viewer.showOutlines)
            obj.outlines = Outlines(obj);

        $createIso.click(function(ev) {


			var keys = [];
			if (obj.atlas.panel)
				keys = Object.keys(obj.atlas.panel.persistentLabels);

			if (keys.length == 0)
			{
				if (obj.atlas.currentLabel.surfacereference != undefined)
				{
					 loadSurfIntoViewport(obj.atlas.currentLabel,viewer);
				}
				else
				{
					attachSurfaceRef(obj.atlas,obj.atlas.currentLabel,function()
					{
						 loadSurfIntoViewport(obj.atlas.currentLabel,viewer);
					});
					/*
					createISOfromLabel(obj.atlas,obj.atlas.currentLabel, function(fobj) { 
						obj.atlas.currentLabel.surfacereference = fobj;
						fobj.atlasref = {atlas:obj.atlas,label:obj.atlas.currentLabel};
						loadSurfIntoViewport(obj.atlas.currentLabel) 

					});*/
				}

			}
			else
			{

				createISO(0);
				function createISO(k)
				{
					if (k >= keys.length)
						return;
					else

					{
						attachSurfaceRef(obj.atlas,obj.atlas.content.labels[keys[k]],function()
						{
						  loadSurfIntoViewport(obj.atlas.content.labels[keys[k]],viewer);
						  createISO(k+1); 							
						});
/*						KViewer.atlasTool.createISOfromLabel(obj.atlas, obj.atlas.content.labels[keys[k]], function(){  
						  loadSurfIntoViewport(obj.atlas.content.labels[keys[k]]);
						  createISO(k+1); 
						  });*/
					}
				}

			}





        });


		that.computeIsoSurf2 = function(fobj,label,progress,done)
		{
			progress("creating isosurface");

			executeImageWorker({func:'createISOSurf', 
					data:fobj.content.nifti.data,
					sizes:fobj.content.nifti.sizes,
					edges:fobj.content.nifti.edges,
					detsign:fobj.content.nifti.detsign,
					label:{name:label.name,key:label.key,color:label.color,bbox:label.bbox}

			},[],
				function(e)
				{
					if (progress)
						progress(e);
				}
				,
				function(e)
				{
					if (progress)
						progress(); 
					$.extend(fobj.content,e.execObj);

					done(fobj);

				}
				);


		}




		function updateGetPixelFunction(nii,R)
		{

  			 var Labels = {} ;
			 if (obj.atlas.panel)
			  	 Labels = $.extend(false,Labels,obj.atlas.panel.persistentLabels);
			 if (obj.atlas.currentLabel)
				 if (obj.atlas.currentLabel.key != "0")
				 	Labels[obj.atlas.currentLabel.key] = obj.atlas.currentLabel;


			if (Object.keys(Labels).length == 0)
				obj.getPixel = function () { return [0,0,0,0];}
			else
			{
	 			if (that.defField != undefined)
	 				obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,R,that.defField.content);
	 			else
	 				obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,R);
			}
	 		return obj.getPixel ;
		}


        obj.updateGetPixelFunction = updateGetPixelFunction;

	   /***************************************************************************************
		* close the view
		****************************************************************************************/  
		function close()
		 {             	  
		      signalhandler.detach('positionChange',obj.updateid);

			  for (var k = 0; k< obj.divs.length;k++)
				 obj.divs[k].remove();

			  for (var k = 0; k < viewer.atlas.length;k++)
			  {
				if (obj == viewer.atlas[k])
				{
					viewer.atlas.splice(k,1);
					break;
				}
			  }			

			  if (obj.surfacecolref)
			  {
			  		for (var k = 0; k < obj.surfacecolref.overlays.length;k++)
			  		{
			  			 if (obj.surfacecolref.overlays[k] == obj)
			  			 {
			  			 	obj.surfacecolref.overlays.splice(k,1);
			  			 	obj.surfacecolref.update();
			  			 	break;
			  			 }
			  		}
			  }

			  
		      if (obj.outlines != undefined)
				{
					obj.outlines.close();
					obj.outlines = undefined;
				}





			  viewer.drawSlice({mosaicdraw:true});	
		 }
		 obj.close = close;
		 signalhandler.attach("close",close);
	
	 	 if (intent!=undefined & intent.hasPanel != undefined & obj.atlas.panel == undefined)
			obj.atlas.panel = KAtlasPanel(obj.atlas,intent.hasPanel );

		 return obj;
	}









    $menu.append($("<li><a>Statistics</a> </i></li>").click(function() {
         that.statdlg.toggle();
         that.statdlg.dostats(); }
    ));
   
    that.statdlg = new statistics_dialog();


  /***************************************************************************************
   * statistics dialog
   ****************************************************************************************/  




 	that.computeStats = computeStats;
	function computeStats(atlasobject,img,map)
	{
		  var m = 0;
		  var m2 = 0;
		  var cnt = 0;
		  var atl  = atlasobject.content;
		  var w = atl.sizes[0];
		  var wh = atl.sizes[0]*atl.sizes[1];

		  if (map == undefined)
		  	 map = function(x) {return x;}

		  var stats = {};


		  var getPixel = KAtlasTool.updateGetPixelFun(atl,img);

		  for (var z = 0; z < img.sizes[2];z++)
			for (var y = 0; y < img.sizes[1];y++)
			  for (var x = 0; x < img.sizes[0];x++)
			  {
					var lab = getPixel(x,y,z);
					if (lab > 0)
					{
						if (stats[lab] == undefined)
						{
							stats[lab] = {m:0,m2:0,cnt:0};
						}
						var v = img.data[x+img.sizes[0]*y + img.sizes[0]*img.sizes[1]*z];

						if (!isNaN(v))
						{
							v = map(v);
							stats[lab].m += v;
							stats[lab].m2 += v*v;
							stats[lab].cnt++;
						}
					}
			  }         

		 var labels = Object.keys(stats);
		 for (var k = 0; k < labels.length;k++)
		 {   var s = stats[labels[k]];

			 s.mean = s.m/s.cnt;
			 s.quad = s.m2/s.cnt;
			 s.std =  math.sqrt(s.quad- s.mean*s.mean);
			 s.vol_mm = img.voxSize[0]*img.voxSize[1]*img.voxSize[2]*s.cnt;
			 s.label = atl.labels[labels[k]];
		 }



		 return stats;
	}








    function statistics_dialog()
    {
        var that = new dialog_generic();
        that.$frame.hide();
        $("<li><a>Atlas statistics</a></li>").appendTo(that.$menu)
//              .append( $("<ul></ul>") .append($("<li>Send kill signal</li>").click( ))
//                                      .append($("<li>Clear errorenous jobs</li>").click(  ) )
//                      );
        $("<li><a> <i class='fa fa-refresh'></i> </a>  </li>").click(dostats  ).appendTo(that.$menu);

        //that.$container.append($("<div id='roistatsdialog'></div>"));


		function dostats(which)
		{
     	   $(document.body).addClass("wait");
     	   setTimeout(function()
     	   {
     	   	 dostats_(which);
     	     $(document.body).removeClass("wait");
     	   },100);
		}

	
        function dostats_(which)
        {


           var _imgs = {};
           for (var k = 0; k< KViewer.viewports.length;k++)
               if (KViewer.viewports[k] != undefined && KViewer.viewports[k].medViewer != undefined && KViewer.viewports[k].medViewer.nii != undefined)
               {
                  var v = KViewer.viewports[k].getCurrentViewer();
                  _imgs[v.currentFileID] = KViewer.viewports[k].getCurrentViewer();

               }

           var ats = Object.keys(atlass);
           var imgs = Object.keys(_imgs);

			
		   that.$container.find(".KRoistat").remove();


           for (var k = 0; k < ats.length; k++)
           {
                
                var atl = atlass[ats[k]];
                var $sdiv = $("<div class='KRoistat'> <h2>"+atl.filename+"</h2></div>").appendTo(that.$container);
				
				var r = atl.content;
				var totsz = r.sizes[0]*r.sizes[1]*r.sizes[2];					
			
				var $idiv = $("<div class='KRoistat_sub'> </div>").appendTo($sdiv);

                for (var j=0;j< imgs.length;j++)
                {
					    $("<h3>" + _imgs[imgs[j]].currentFilename + "</h3>").appendTo($idiv);			

					    var $div = $("<div class='KViewPort_tableViewer_outerDiv'>").appendTo($idiv);
					    var $table =  $("<table class='KViewPort_tableViewer' ></table>").appendTo($div);
						var $head = $("<thead>")
						var $body = $("<tbody>")

						var $row = $("<tr ></tr>");
						$row.appendTo($head);
						var $span = $("<span> Name </span>");
						$row.append($("<td></td>").append($span));	
						var $span = $("<span> Size (mm) </span>");
						$row.append($("<td></td>").append($span));	
						var $span = $("<span> mean </span>");
						$row.append($("<td></td>").append($span));	
						var $span = $("<span> stdev </span>");
						$row.append($("<td></td>").append($span));	
						var $span = $("<span> z </span>");
						$row.append($("<td></td>").append($span));	



						var stats = computeStats(atl,_imgs[imgs[j]].nii);
						var scale = _imgs[imgs[j]].nii.datascaling.e;
						var keys = Object.keys(stats);
						for (var k = 0; k <keys.length;k++)
						{


							var $row = $("<tr ></tr>");
							$row.appendTo($body);


							var s = stats[keys[k]];

							var $span = $("<span> "+ s.label.name+"</span>");
							$row.append($("<td></td>").append($span));		    
							var $span = $("<span> "+ niceFormatNumber(s.cnt*r.voxSize[0]*r.voxSize[1]*r.voxSize[2]) +"</span>");
							$row.append($("<td></td>").append($span));		    
							var $span = $("<span> "+ niceFormatNumber(s.mean) + " / " + niceFormatNumber(scale(s.mean)) +"</span>");
							$row.append($("<td></td>").append($span));		    
							var $span = $("<span> "+  niceFormatNumber(s.std) + " / " + niceFormatNumber(scale(s.std))+"</span>");
							$row.append($("<td></td>").append($span));		    
							var $span = $("<span> "+  niceFormatNumber(s.std/s.mean) +"</span>");
							$row.append($("<td></td>").append($span));		    

						}

						$table.append($head);
						$table.append($body);
						attachTableOperator($div,undefined,true);	
						$table.show();
				     

                }
           }

        }
        that.dostats = dostats;

        return that;
    }














  
    return that;
}


KAtlasTool.isAtlas = function(fobj)
{
	if (fobj.content.extension != undefined)
	{
		if (fobj.content.extension.content.contentType == "application/xml" | fobj.content.extension.content.contentType ==  "text/xml")
		{
			if (fobj.content.extension.content.getElementsByTagName('Label').length > 0)
				return true;
		}

	}

	if (fobj.fileinfo && fobj.fileinfo.Tag && fobj.fileinfo.Tag.search("/atlas/")>-1)
		return true;

	return false;
}





KAtlasTool.updateGetPixelFun = function(atlas_nii,nii,Labels,R,def,fromWorld)
  {

		 var edges;
		 if (fromWorld)
		 	edges = math.diag([1,1,1,1]);
		 else
			edges = nii.edges;

	
		 if (def != undefined)
		  {
			   var A;
			   if (def.invedges == undefined)
			   		def.invedges = math.inv(def.edges);

			   if (R == undefined)
				   A = ( math.multiply(def.invedges, edges ) )._data;
			   else
				   A = (math.multiply(math.multiply( math.multiply(def.invedges, master.reorientationMatrix.matrix), edges ),R) )._data;
			
			   var B;
			   if (atlas_nii.invedges)			   
				   B = atlas_nii.invedges;
			   else
			   	   B = math.inv(atlas_nii.edges)._data;
			   if (Labels == undefined)
			   {
				   return function(px,py,pz)
				   {
					  var ps = [0,0,0,1];
					  for (var j=0;j<3;j++ )
						 ps[j] = trilinInterp(def,px,py,pz,A,def.sizes[0]*def.sizes[1]*def.sizes[2]*j); 
					  return NNInterp(atlas_nii,ps[0],ps[1],ps[2],B,0); 
				   }  	
			   }
			   else if (Object.keys(Labels).length > 0)
			   {
				   
				   return function(px,py,pz)
				   {
					  var ps = [0,0,0,1];
					  for (var j=0;j<3;j++ )
						 ps[j] = trilinInterp(def,px,py,pz,A,def.sizes[0]*def.sizes[1]*def.sizes[2]*j); 
					  //return trilinInterp_MAP(atlas_nii,ps[0],ps[1],ps[2],B,0,label); 
					  return trilinInterp_atlas(atlas_nii,ps[0],ps[1],ps[2],B,0,Labels);     
				   }
			   }
			   else
				  return function(px,py,pz)
				  {
					 return [0,0,0,0];
				  }

		  }
		  else
		  {
			  var A;
			  if (R == undefined)
				  A = ( math.multiply(math.inv(atlas_nii.edges), edges ) )._data;
			  else
				  A = (math.multiply(math.multiply( math.multiply(math.inv(atlas_nii.edges), KViewer.reorientationMatrix.matrix), edges ),R) )._data;
			


			  if (Labels == undefined)
			  {
			  	 return function(px,py,pz)
				  {

                     return NNInterp(atlas_nii,px,py,pz,A,0);     
    				        
				  }
			  }
			  else if (typeof Labels == "number")
			  {
			  	 return function(px,py,pz)
				  {

                      return trilinInterp_MAP(atlas_nii,px,py,pz,A,0,Labels);     
    				        
				  }
			  }
			  else if (Object.keys(Labels).length > 0)
			  {
				  return function(px,py,pz)
				  {

                     return trilinInterp_atlas(atlas_nii,px,py,pz,A,0,Labels);     
    				        
				  }
			  }
			  else
				  return function(px,py,pz)
				  {
					 return [0,0,0,0];
				  }

		  }
	}








function KAtlasPanel(atlas,state)
{

    var panel = KPanel($(document.body),atlas.filename,"Atlas: " + atlas.filename.replace(".nii","").replace(".gz",""));
 	panel.closeOnCloseAll = true
 	panel.persistentLabels={};

	panel.getState = function()
	{
		return {persistentLabels:panel.persistentLabels};
	}

	

    //////// compute centroids
	var hasCentroids = false;
 	for (var k in atlas.content.labels)
    {
    	var label =  atlas.content.labels[k];
    	if (label.centroid)
    	{
    		hasCentroids = true
    		break;
    	}
    }
	if (!hasCentroids)
	{
		var nii = atlas.content;
		for (var z = 0; z < nii.sizes[2]; z++)
		for (var y = 0; y < nii.sizes[1]; y++)
		for (var x = 0; x < nii.wid; x++)
		{
			var l = nii.data[x+nii.wid*y+nii.widhei*z];
			if (nii.labels[l])
			{
				if (nii.labels[l].centroid == undefined)
				{
					nii.labels[l].centroid = [0,0,0];
					nii.labels[l].firstvoxel = [x,y,z];
					nii.labels[l].size = 0;
				}
				nii.labels[l].centroid[0] += x;
				nii.labels[l].centroid[1] += y;
				nii.labels[l].centroid[2] += z;
				nii.labels[l].size++;
			}
		}

		for (var x in nii.labels)
		{
			if (nii.labels[x].centroid  != undefined)
			{
				nii.labels[x].centroid[0] = Math.round(nii.labels[x].centroid[0]/nii.labels[x].size);
				nii.labels[x].centroid[1] = Math.round(nii.labels[x].centroid[1]/nii.labels[x].size);
				nii.labels[x].centroid[2] = Math.round(nii.labels[x].centroid[2]/nii.labels[x].size);

				if  (nii.data[nii.labels[x].centroid[0]+nii.wid*nii.labels[x].centroid[1]+nii.widhei*nii.labels[x].centroid[2]] != x)
					nii.labels[x].centroid = nii.labels[x].firstvoxel;
				
				nii.labels[x].centroid  = math.multiply(nii.edges,		
						[nii.labels[x].centroid[0],nii.labels[x].centroid[1],nii.labels[x].centroid[2],1])._data;
				nii.labels[x].size = nii.labels[x].size*nii.voxSize[0]*nii.voxSize[1]*nii.voxSize[2];
			}
			else
				delete nii.labels[x];
		}

	}



	panel.setPersistent = function (labels)
	{		
			panel.persistentLabels = {};
			for (x in labels)
				panel.persistentLabels[x] = atlas.content.labels[x];
			updatePersistentLabels(false);
//			signalhandler.send('positionChange');
	    	signalhandler.send("updateImage",{id:atlas.fileID});
	}

    var $fileRow = $("<div class='roiTool_panel_flex_persistent'></div>").appendTo(panel.$container);
    var $showAll = $("<a class='KViewPort_tool'><span> Show all </span></a>").appendTooltip("show all regions permanently").click(
		function(e)
		{
			panel.persistentLabels = {};
			$body.find("tr:visible").map(function() { var key = $(this).attr("value"); panel.persistentLabels[key] = atlas.content.labels[key]; });
			updatePersistentLabels(false);
			atlas;
//	    	signalhandler.send('positionChange');
	    	signalhandler.send("updateImage",{id:atlas.fileID});
		}
    )
    $fileRow.append($showAll).append($("<i class='flexspacer'></i>"));
    var $hideAll = $("<a class='KViewPort_tool'><span> Hide all </span></a>").appendTooltip("hide all regions").click(
		function(e)
		{
			panel.persistentLabels = {};
			updatePersistentLabels(false);
//		    	signalhandler.send('positionChange');
	    	signalhandler.send("updateImage",{id:atlas.fileID});
		}
    )
    $fileRow.append($hideAll).append($("<i class='flexspacer'></i>"));
/*
    var $showISO = $("<a class='KViewPort_tool'><span> 3D </span></a>").appendTooltip("show3d").click(
		function(e)
		{
			
			var keys = Object.keys(panel.persistentLabels);
			createISO(0);
			function createISO(k)
			{
				if (k >= keys.length)
					return;
				else
					KViewer.atlasTool.createISOfromLabel(atlas.content.labels[keys[k]], function(){    createISO(k+1); });
			}
		}
    )
    $fileRow.append($showISO).append($("<i class='flexspacer'></i>"));*/
    var $toROI = $("<a class='KViewPort_tool'><span> toROI </span></a>").appendTooltip("toroi").click(
		function(e)
		{
			 var fileID = atlas.fileID;
			 //if (KViewer.atlasTool.defField)
			 //	fileID = KViewer.atlasTool.defField.fileID;

			 var labels;
			 var name;
			 if (Object.keys(panel.persistentLabels).length > 0)
			 {
			 	name = "collection";
			 	labels = Object.keys(panel.persistentLabels);
			 	if (labels.length ==1)
			 		name = atlas.content.labels[labels[0]].name;
			 }
			 else
			 {
			 	name = atlas.content.labels[panel.currentLabel].name;
			 	labels = [panel.currentLabel];
			 }



			 KViewer.roiTool.pushROI(fileID,name,undefined,function(roi)
				  {          			  	  
					 panel.progressSpinner("rendering ROI");

					 KViewer.atlasTool.renderROIfromLabel(atlas,roi,labels,function()
					 {
						 if (!KViewer.roiTool.enabled)
						    KViewer.roiTool.toggle();
						 panel.progressSpinner();
					 });

					},panel.progressSpinner);



		}
    )
    $fileRow.append($toROI).append($("<i class='flexspacer'></i>"));

    var $stats = $("<a class='KViewPort_tool'><span> Stats </span></a>").appendTooltip("compute statistics over contrasts").click(function(){ 
    	 KViewer.atlasTool.statdlg.toggle();
         KViewer.atlasTool.statdlg.dostats();})
    $fileRow.append($stats).append($("<i class='flexspacer'></i>"));
 
    var $alpha = $("<a class='KViewPort_tool'><span> alpha </span> <input style='height:15px;width:40px' min=0.1 max=1 step=0.1 type='number' value='"+atlas.content.alpha+"'> </a>")
    $fileRow.append($alpha).append($("<i class='flexspacer'></i>"));
	var $input = $alpha.find("input");
	$input.on("change",function(){
		atlas.content.alpha = parseFloat($input.val())
		signalhandler.send("positionChange");
	});


    var $div = $("<div class='atlaslabeltable  KViewPort_tableViewer_outerDiv'>").appendTo(panel.$container);
	var $table =  $("<table class='KViewPort_tableViewer' ></table>").appendTo($div);
	var $head = $("<thead class='atlaslabelhead'>")
	var $body = $("<tbody>")

	var $row = $("<tr ></tr>");
	$row.appendTo($head);
    $row.append($("<td class='fixedwidth' fixedwidth='6'><i class='fa fa-fw '></i> </td>"));
	var $span = $("<input class='KSearchHTML'> </input>");
	$row.append($("<td ></td>").append($span));	
	$row.append($("<td ></td>"));	

	var $row = $("<tr ></tr>");
	$row.appendTo($head);
    $row.append($("<td class='fixedwidth' fixedwidth='6'><i class='fa fa-fw '></i> </td>"));
	var $span = $("<span> Name </span>");
	$row.append($("<td ></td>").append($span));	
	var $span = $("<span> Size </span>");
	$row.append($("<td ></td>").append($span));	

	


	
	function setCurrentLabel(k,scrollTo)
	{
		if (k != -1)
		{
			$body.find(".selected").removeClass("selected");
			var $row = $body.find("tr[value="+k+"]")
			$row.addClass("selected");	
			if (scrollTo && panel.currentLabel != k)
			{
				panel.currentLabel = k;
				if ($row.position().top != 0)
					$row.parent().parent().parent().scrollTop($row.position().top-65);
			}
			else
				panel.currentLabel = k;
		}
	}
	panel.setCurrentLabel = setCurrentLabel;


	function updatePersistentLabels(updateWMQLquery)
	{
		$body.find(".selectedBold").removeClass("selectedBold");
		for (x in panel.persistentLabels)
		{
			var $row = $body.find("tr[value="+x+"]")
			$row.addClass("selectedBold");	
		}

		if (typeof KWMQLPanel != "undefined")
		{
			var keys = Object.keys(KWMQLPanel.panels);
			keys = keys.filter(function(x) {return (x.search(atlas.fileID+"_")>-1)})
			var q = Object.keys(panel.persistentLabels).join(" and ")
			for (var k = 0; k < keys.length;k++)
			{
				var wmqlpanel = KWMQLPanel.panels[keys[k]];
				wmqlpanel.$query_area.val(q);
				wmqlpanel.$query_area.trigger("keyup");

			}
		}
	}
	



    for (var k in atlas.content.labels)
    {
    	var label =  atlas.content.labels[k];
    	

       var dragstuff = "draggable='true' data-type='file' data-mime='nii' data-tag='/roi/' data-intent='labelname:\""+label.name+"\",atlaskey:"+label.key+"'  data-fileID='"+atlas.fileID+"' data-filename='"+atlas.filename+":"+label.name+"' ";
       dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";

    	
		var $row = $("<tr  "+dragstuff+" value="+k+"></tr>");
		$row.click(function(k,$row) { return  function(e){
		
		    if (e.ctrlKey)
		    {
		    	if (panel.persistentLabels[k])
		    		delete panel.persistentLabels[k];
		    	else
		    		panel.persistentLabels[k] = atlas.content.labels[k];
		    	updatePersistentLabels(true);
				signalhandler.send("updateImage",{id:atlas.fileID});

	//	    	signalhandler.send('positionChange');
		    }
		    else if (e.shiftKey)
		    {
				$row.prevUntil(".selected").addBack().each(function(x,y) {
					var a = $(y).attr('value');
					if (panel.persistentLabels[a])
						delete panel.persistentLabels[a];
					else
						panel.persistentLabels[a] =atlas.content.labels[a];
				 } )
				 updatePersistentLabels(true);
		    	signalhandler.send("updateImage",{id:atlas.fileID});

	//			 signalhandler.send('positionChange');
		    }
		    else
		    {
				setCurrentLabel(k)
				var label = atlas.content.labels[k]
				KViewer.currentPoint = math.matrix(label.centroid);
				
				signalhandler.send('positionChange');
				signalhandler.send('labelChange');								
		    }

		} }(k,$row));
	
		$row.appendTo($body);
	    $row.append($("<td style='background-color:"+RGB2HTML(label.color[0],label.color[1],label.color[2])+";'  ></td>"));

		var $span = $("<span> "+label.name+" </span>");
		$row.append($("<td></td>").append($span));	
		var $span = $("<span> "+label.size+" </span>");
		$row.append($("<td></td>").append($span));	

    }




    $table.append($head);
	$table.append($body);
	attachTableOperator($div,undefined,true);	
	$table.show();
	panel.$container.width($table.width()+10);

	if (state != undefined)
    {
    	if (state.persistentLabels)
    	{
    		panel.persistentLabels = state.persistentLabels;
    		updatePersistentLabels(false);
    	}
    }


	return panel;

}