
   
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

  that.prepAtlas = function (fobj)
  {
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
	   return computeBBoxes(fobj.content);
  }
	
  that.addAtlas = function (fobj)
  {
       if (fobj.contentType == 'nii')
       {
           // henriks flatmap
		   if (0) //fobj.content.sizes[3] == 4)
		   {
              that.invdefField = fobj;
		   }
		   
		   if (fobj.content.datatype == 'float' & (fobj.content.sizes[3] == 3 | fobj.content.sizes[4] == 3)) // a warp field
		   {
			  that.defField = fobj;
			  signalhandler.send("positionChange");
		   }
		   else
		   {

			   if (that.prepAtlas(fobj) === false)
			   {
					return;				   
			   }

			   if (fobj.project != undefined && (typeof currentModule != "undefined" && fobj.project != currentModule))
			   {
				   fobj.fileinfo = {Filename:fobj.fileinfo.Filename}
			   }
			   
		   	   if (that.objs[fobj.fileID] != undefined)
					return that.objs[fobj.fileID];
			   that.objs[fobj.fileID] = fobj;
			   
			   fobj.content.alpha = 0.7;

		   }
		   that.update();
	//	   signalhandler.send('positionChange');
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


  that.toggleAllLabels = function (obj,on)
  {

		    if (obj.panel == undefined)
		    {
				obj.panel = KAtlasPanel(obj);
			    obj.panel.toggle();
		    }
		    if (Object.keys(obj.panel.persistentLabels).length >0 || !on)
                obj.panel.hideAll()
		    else
                obj.panel.showAll()

  }


  /***************************************************************************************
   *  table updater 
   ****************************************************************************************/

  that.update = function(atpoint)
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
         $row.append($("<td> <i class='fa  fa-close'></td>").click(function() { that.defField = undefined; that.update();  signalhandler.send('positionChange'); } ));
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

    var descrip = ""
	var $tbody = $("<tbody>").appendTo($table);
    for  (var k in that.objs)
    {
	   var id = that.objs[k].fileID;
	   var point = that.objs[k].currentPoint
	   if (that.defField == undefined)
	       point = KViewer.currentPoint;

       if (point == undefined) 
           point = math.matrix([0,0,0,1]);
       if (atpoint != undefined)
	       point = atpoint;

	   
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
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-building-o'></td>").click(function(k_) { return function() { 
		   if (that.objs[k_].panel == undefined)
				that.objs[k_].panel = KAtlasPanel(that.objs[k_]);
			else
				that.objs[k_].panel.toggle();
			} }(k) ));
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-eye'></td>").click(function(k_) { return function() { 
            that.toggleAllLabels(that.objs[k_])
			} }(k) ));
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-close'></td>").click(function(k_) { return function() { delete that.objs[k_]; that.update(); } }(k) ));

       var $row = $("<tr " + dragstuff + "></tr>").appendTo($table).on("drop",loadFromDrop(drophandler));

	   var key = 0;

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
			   if (  (ps[0] >= 0 && ps[0] < nii.sizes[0] &&
				      ps[1] >= 0 && ps[1] < nii.sizes[1] &&
				      ps[2] >= 0 && ps[2] < nii.sizes[2]) )
    			   key = nii.data[nii.sizes[0]*nii.sizes[1]*ps[2] + ps[1]*nii.sizes[0] + ps[0]];
           }
	   }
	   else
	   {
  	       var einv = math.inv(nii.edges);
 	       var p = math.round(math.multiply(einv,point)._data);
	       if (p[0] != undefined & p[1] != undefined & p[2] != undefined & 
	          (p[0] >= 0 && p[0] < nii.sizes[0] &&
	           p[1] >= 0 && p[1] < nii.sizes[1] &&
	           p[2] >= 0 && p[2] < nii.sizes[2]) )
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
			   descrip += label.name + " (" + key + ")<br>";
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
		   that.objs[k].currentLabel = {key:key, name:"("+key+")", color:col};	   	   
	   }       

	   if (that.objs[k].panel)
	   {
			that.objs[k].panel.setCurrentLabel( that.objs[k].currentLabel.key,true);

	   }

    }     
    that.attachTableOperator($table.parent());
    return descrip;
   
  }

  that.update();
  that.updatePoint = function(p,viewer)
  {

		that.update();		

  }
/*
  signalhandler.attach('positionChange',function(e)
  {
	if (master.crosshairMode)  	
  	 	that.updatePoint();
  });
*/  

  function computeBBoxes(atlas_nii)
  {
      	var bboxes = {}
        var max = [-100000, -100000, -100000];
        var min = [100000, 100000, 100000];

        var edges = atlas_nii.edges;
        var e = edges._data;

	    var sz = atlas_nii.sizes;
	    var lcnt = 0;
        for (var z = 0; z < sz[2]; z++)
		{
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
							lcnt++;
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

			if (lcnt > 5000)
			{
				alertify.error('too many labels for an common label image/atlas, stopping')
				return false;
			}
		}

		atlas_nii.present_labels = {}

		if (atlas_nii.labels != undefined)
			for (var k in atlas_nii.labels)
			{
				atlas_nii.labels[k].bbox = bboxes[k];

				atlas_nii.present_labels[k] = atlas_nii.labels[k];
			}
		else
		{
			atlas_nii.labels = {};
			for (var k in bboxes)
			{
			    var idx = (parseInt(k)*32)%256;
			    var col = [KColormap.jet[0][idx],KColormap.jet[1][idx],KColormap.jet[2][idx]];
				
				atlas_nii.labels[k] = {bbox:bboxes[k], key:k , name:"("+k+")" , color:col}
				atlas_nii.present_labels[k] = atlas_nii.labels[k];
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
            else if (KViewer.navigationTool.isinstance && 
                (( master.navigationTool.movingObjs[obj.fileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ) )
            {
				if (KViewer.navigationTool.deffield_extern != undefined)
				{
				    deffield = KViewer.navigationTool.deffield_extern
					fobj.fileinfo.patients_id = KViewer.navigationTool.deffield_extern.fileinfo.patients_id;
					fobj.fileinfo.studies_id  = KViewer.navigationTool.deffield_extern.fileinfo.studies_id;
				}
				else (KViewer.reorientationMatrix != undefined && KViewer.reorientationMatrix.deffield != undefined)
				{
				    deffield = KViewer.reorientationMatrix.deffield			
				}
				
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
					fobj.buffer = e.execObj.buffer
					fobj.content = prepareMedicalImageData(parse(e.execObj.buffer), fobj);
					if (fobj.fileinfo && fobj.fileinfo.surfreference)
						fobj.fileinfo.surfreference.content.nifti = fobj.content 

					done(fobj);
					KViewer.cacheManager.update();
					KViewer.roiTool.update();
				}
				);
		}

	    function renderROIintoAtlas(obj,fobj,val,typ,done)
		{
			var img = fobj.content;

			that.progressSpinner("rendering volume");
		
			executeImageWorker({func:'RoiToAtlas', 
						   atlas:ready4Clone(obj.content,true),
						   img:ready4Clone(img), key:val,typ:typ },[obj.content.buffer],that.progressSpinner,
				function(e)
				{
					var tmp = prepareMedicalImageData(parse(e.execObj.buffer), obj);
					obj.content.data = tmp.data;
					obj.content.buffer = e.execObj.buffer;
					signalhandler.send("updateFilelink",{id:obj.fileID});
					done()
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
		  {
			  function tryit()
				  {
					  if (roi.rendering_in_progress)
						  setTimeout(tryit,100)
					  else 
						  callback(roi);
				  }
			  tryit();
		  }
		  else
		  {
				bgndcontrast.intendedROIid = fid;	                                         	
				master.roiTool.pushROI(bgndcontrast.fileID,name,undefined,function(roi)
				{          
					 roi.rendering_in_progress = true
					 delete bgndcontrast.intendedROIid;
					 progress("rendering ROI");
					 if (typeof key == "string")
					     key = parseInt(key);
					 renderROIfromLabel(atlas,roi,key,function()
					 {
						 delete roi.rendering_in_progress;
						 callback(roi);
						 signalhandler.send("updateFilelink",{id:fid});
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



        var objname = obj.atlas.filename.replace(".nii.gz","").replace(".nii","")
	   /***************************************************************************************
		* the subviews toolbar
		****************************************************************************************/  
		var $captiondiv,$dragdiv,$createIso,$createOutlines,$panel,$editing,$save;
		obj.divs = [ $("<br style='clear:both' />"),
					 $("<div  class='KViewPort_tool atlas persistent'>  <i class='fa fa-close fa-1x'></i></div>").click( close  ).mousedown(viewer.viewport.closeContextMenu(obj)),
					 $save = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-save'></i></div>").appendTooltip("save").click(function() { 

                        if (obj.atlas.editing_label == undefined)
						{
							
                            saveAtlas(obj.atlas,function(){

								KViewer.iterateMedViewers(function(m)
								{
									for (var k = 0; k < m.atlas.length; k++)
										if (obj.atlas.fileID == m.atlas[k].atlas.fileID)
											m.atlas[k].$savediv.removeClass("notsaved")											                                           	
									$(document.body).removeClass("wait");                        	                    
	
								});          
								
                            });
						}
                        else
			  	          alertify.error("close first editing mode");

          			 }),
					 $createIso = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-1x'><span>3D</span></i></div>").appendTooltip("isosurfatlas").hide(),
                     $createOutlines = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-1x'><span> <i class='fa fa-lemon-o fa-1x'></i></span></i></div>").appendTooltip("multioutlines"),     
                     $panel = $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-building-o fa-1x'></i></div>").appendTooltip("open panel")
              			 .click(function() {
							   if (obj.atlas.panel == undefined)
									obj.atlas.panel = KAtlasPanel(obj.atlas);
								else
									obj.atlas.panel.toggle();
              			 }),
                     $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-eye fa-1x'> </div>")
          			 .click(function() { 
							if (obj.atlas.panel == undefined)
							{
								obj.atlas.panel = KAtlasPanel(obj.atlas);
								obj.atlas.panel.toggle();
							}
							if (Object.keys(obj.atlas.panel.persistentLabels).length >0)
								obj.atlas.panel.hideAll()
							else
								obj.atlas.panel.showAll(true)

          			 }),
                     $("<div  class='KViewPort_tool atlas'>  <i class='fa fa-plus fa-1x'> </div>").appendTooltip("create ROI from atlas region")
          			 .click(function(viewer) { return function() { 

					    var name = obj.atlas.currentLabel.name;
						var atlaskeys = obj.atlas.currentLabel.key
						if (obj.atlas.panel != undefined && Object.keys(obj.atlas.panel.persistentLabels).length > 0)
						{
							atlaskeys =Object.keys(obj.atlas.panel.persistentLabels);
							name = "collection"
						}
						if (atlaskeys == -1)
						{
							alertify.error('no labels selected; select some labels in the panel or point to a label via the crosshair')
							return;
						}
						 
						that.getROIfromSinglelabel(obj.atlas,atlaskeys,name,viewer.content,
								function(roi) { viewer.viewport.setContent(roi,{}) },viewer.viewport.progressSpinner);


          			   }}(viewer)),
                    $editing=$("<div  class='KViewPort_tool atlas'>  <i class='fa fa-pencil fa-1x'> </div>").appendTooltip("edit atlas region")
          			 .click(function(viewer) { return function(e) { 


                        if (obj.atlas.editing_label != undefined)
                        {
                             editing_contextmenu(e)
                        }
                        else
                        {

							function edit(label)
							{
								 $(document.body).addClass("wait");                        	                    
								 that.getROIfromSinglelabel(obj.atlas,label.key,label.name,obj.atlas,
									function(roi) { 
	
										obj.atlas.editing_label = {key:label.key,roiid:roi.fileID};
	
										KViewer.iterateMedViewers(function(m)
										{
	
											for (var k = 0; k < m.atlas.length; k++)
												if (obj.atlas.fileID == m.atlas[k].atlas.fileID)
												{
													m.atlas[k].editing_div.addClass("active")
													m.viewport.setContent(roi,{intent:{nosave:true,color:label.color}}) 
												}
	
										});            
										KViewer.roiTool.makeCurrentGlobal(roi.fileID)
									 //   that.toggleAllLabels(obj.atlas,false)
										$(document.body).removeClass("wait");                        	                    
	
	
	
									},viewer.viewport.progressSpinner);
							}							
                        	if (obj.atlas.currentLabel.key <= 0)
							{
								var labels = [];
								var dict = {}
								for (var k in obj.atlas.content.labels)
									{
										var q = obj.atlas.content.labels[k].name + " (" + k +")"
									    dict[q] = obj.atlas.content.labels[k]
										labels.push(q)
									}
									
								var prompt = {msg:"Create new or edit existing", opt:["NEW"].concat(labels) , optMsg:"Labels:"}
								alertify.prompt(prompt, function(e,str)
								{
									if(e)			
									{	
										if (str.option == "NEW")
										{
											var newl = 0
											while (obj.atlas.content.labels[++newl] != undefined);

											var NewL = {key:newl,name:str.str,color:[0,0,255]}
											obj.atlas.content.labels[newl] =NewL
											obj.atlas.content.present_labels[newl] =NewL
											edit(NewL)
											obj.atlas.panel.update()

										}
										else
										{										
											edit(dict[str.option])
										}
										
									}
								},"newregion");
					
									
							}
                        	else		                        	
                        	{		    
								edit(obj.atlas.currentLabel)
							}
						
                        	
                        }


          			   }}(viewer)),
  					 $captiondiv = $("<div  class='KViewPort_tool atlas caption'> "+obj.atlas.filename+"</div>"),
					 $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>")
				   ];
        obj.editing_div = $editing
		obj.$savediv = $save;

		$dragdiv.attr("draggable",'true');
		$dragdiv.on("dragstart", dragstarter({ type:'file', tag: '/mask/', mime: 'nii', filename: obj.atlas.filename, intent:'atlas:true', close:close,fileID: obj.atlas.fileID }));

		viewer.toolbar.append(obj.divs,'atlas');



		var editing_contextmenu  = KContextMenu(
			function() {

				var $menu = $("<ul class='menu_context'>")
				.append($("<li onchoice='overwrite' > overwrite </li>"))
				.append($("<li onchoice='block' > block </li>"))
				.append($("<li onchoice='cancel' > cancel </li>"));

				return $menu;

			},
			function(str, ev)
			{
                     function unedit()
                     {
							obj.atlas.modified = true
							viewer.viewport.delAllObjs("ROIs",undefined,{roi:roi},"this");
							KViewer.roiTool.makeCurrentGlobal();
							KViewer.dataManager.delFile(obj.atlas.editing_label.roiid);
							KViewer.cacheManager.update();
							KViewer.iterateMedViewers(function(m)
							{
								for (var k = 0; k < m.atlas.length; k++)
									if (obj.atlas.fileID == m.atlas[k].atlas.fileID)
									{
										m.atlas[k].editing_div.removeClass("active")
										if (str != "cancel")
											m.atlas[k].$savediv.addClass("notsaved")
										                                           

									}

							});          
							obj.atlas.editing_label = undefined;  

                     }

					 var roi = KViewer.dataManager.getFile(obj.atlas.editing_label.roiid);
                     if (str != undefined & str != "cancel")
						 renderROIintoAtlas(obj.atlas,roi,obj.atlas.editing_label.key,str,unedit);
                     else if (str == "cancel")
                         unedit();


			}, undefined,false);

		function update()
		{	
			if (obj.atlas.currentLabel != undefined)
				$captiondiv.html(objname+": <b>"+obj.atlas.currentLabel.name+" ("+((obj.atlas.currentLabel.key==-1)?0:obj.atlas.currentLabel.key)+")</b>"); 			
		}
        obj.updateid_lc = signalhandler.attach('labelChange',update);
        obj.updateid = signalhandler.attach('atlasLabelUpdate',update);


        obj.clearMultiOutlines = function()
        {
            if (obj.multi_outlines != undefined)
			{
				for (var j = 0; j < obj.multi_outlines.length;j++)
					obj.multi_outlines[j].close();
			}
			obj.multi_outlines = undefined;
        }

        obj.multi_outline_state = 0;
        obj.draw_multioutline = function(ev) {
			if (obj.multi_outlines) 
			    obj.multi_outline_state = (obj.multi_outline_state +1 )%2;
			obj.clearMultiOutlines()
			var labs = obj.atlas.panel.persistentLabels;
			obj.multi_outlines = []

            var sim = Outlines(obj);
            var vis_labels = sim.compOutline(viewer,true);
            vis_labels = intersect(labs,vis_labels)
			for (var k in vis_labels)			
			{
				var m = Outlines(obj,labs[k]);
				if (obj.multi_outline_state==1)
				    m.no_labels = true;
				else
				    m.no_labels = false;
				m.update(viewer)
				obj.multi_outlines.push(m);
			}
		

		}
		$createOutlines.click(obj.draw_multioutline);




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

        function saveAtlas(atlas,done)
        {
 
				if (electron | userinfo.username == guestuser)
				{
					if (atlas.modified)
					{
						saveNiftilocal(atlas);
						atlas.modified = undefined;
						KViewer.cacheManager.update()
					}
					else
						alertify.error("no changes, not saving ...")
					return;	
				}

				var zipped = true;

				if (atlas.fileinfo && 
					atlas.fileinfo.Filename)
				{ 
					if (atlas.fileinfo.Filename.search("\\.gz") == -1)
						zipped = false;
					if (atlas.fileinfo.SubFolder != "" | atlas.fileinfo.SubFolder != undefined)
						that.lastSaveName = atlas.fileinfo.SubFolder + "/" + atlas.fileinfo.Filename;
					else
						that.lastSaveName = atlas.fileinfo.Filename;
				}
				if (atlas.notzipped)
					zipped = false;

				saveDialog("atlas/labelimage",function(name,finfo) {
							$(document.body).addClass("wait");                        	                    
					 		atlas.filename = spliceSubFolder(name,finfo)
						    $captiondiv.text(atlas.filename)
							finfo.Tag = atlas.fileinfo.Tag;
                            updateTag(finfo,['atlas'], userinfo.username);
					
							uploadUnregisteredBinary(atlas,finfo , that.progressSpinner,
									function(newid, id) {
										$(document.body).removeClass("wait");                        	                    
										done();
										that.update();
									},zipped,{dontremoveoldinstance:true,askonOverwrite:true});								
			  
				},that.lastSaveName,atlas.fileinfo,{askonOverwrite:true})
		

    
			}


		function updateGetPixelFunction(nii,R)
		{

  			 var Labels = {} ;
			 if (obj.atlas.panel)
			  	 Labels = $.extend(false,Labels,obj.atlas.panel.persistentLabels);
			 if (obj.atlas.currentLabel)
				 if (obj.atlas.currentLabel.key != "0")
				 	Labels[obj.atlas.currentLabel.key] = obj.atlas.currentLabel;
			 if (obj.atlas.editing_label != undefined)
			 {
				 Labels[obj.atlas.editing_label.key] = undefined;
			 }

			if (Object.keys(Labels).length == 0)
				obj.getPixel = function () { return [0,0,0,0];}
			else
			{
	 			if (that.defField != undefined)				    
	 				obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,R,that.defField.content);
				else if (KViewer.navigationTool.isinstance && 
                   (( master.navigationTool.movingObjs[obj.atlas.fileID] != undefined & KViewer.navigationMode == 0) | KViewer.navigationMode == 2 ) )
                {
	        		if (KViewer.reorientationMatrix.deffield)
				        obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,R,KViewer.reorientationMatrix.deffield);
					else
					    obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,R);
                }
	 			else
	 				obj.getPixel = KAtlasTool.updateGetPixelFun(obj.atlas.content,nii,Labels,undefined);
			}
	 		return obj.getPixel ;
		}


        obj.updateGetPixelFunction = updateGetPixelFunction;

	   /***************************************************************************************
		* close the view
		****************************************************************************************/  
		function close(force)
		 {             	  

			  if (obj.atlas.editing_label != undefined  & force != undefined)
			  {
			  	  alertify.error("close first editing mode");
			      return;
			  }

		      signalhandler.detach('labelChange',obj.updateid_lc);
		      signalhandler.detach('close', obj.close_id );
		      
              if (obj.clearMultiOutlines)
                  obj.clearMultiOutlines();

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
		 obj.close_id = signalhandler.attach("close",close);
	
	 	 if (intent!=undefined & intent.hasPanel != undefined & obj.atlas.panel == undefined)
			obj.atlas.panel = KAtlasPanel(obj.atlas,intent.hasPanel );

		 return obj;
	}









    that.$topRow.append($("<li style='margin-left:5px; padding-left:5px; border-left:1px solid gray'><a>Statistics</a> </i></li>").click(function() {
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
							stats[lab] = {m:0,m2:0,cnt:0,totcnt:0};
						}
						var v = img.data[x+img.sizes[0]*y + img.sizes[0]*img.sizes[1]*z];

						if (!isNaN(v))
						{
							v = map(v);
							stats[lab].m += v;
							stats[lab].m2 += v*v;
							stats[lab].cnt++;
							stats[lab].totcnt++;
						}
						else
							stats[lab].totcnt++;
						
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
        $("<li><a> <i class='fa fa-refresh'></i> </a>  </li>").click(dostats).appendTo(that.$menu);        
        $("<li><a> <i class='fa fa-copy'></i>copy table to clipboard </a>  </li>").click(function() { copyTableToClipboard($table.get(0)); } ).appendTo(that.$menu);


        //that.$container.append($("<div id='roistatsdialog'></div>"));

        var $table

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
           var rois = {};
           for (var k = 0; k< KViewer.viewports.length;k++)
               if (KViewer.viewports[k] != undefined && KViewer.viewports[k].medViewer != undefined && KViewer.viewports[k].medViewer.nii != undefined)
               {
                  var v = KViewer.viewports[k].getCurrentViewer();
                  _imgs[v.currentFileID] = v;
                  for (var j = 0; j < v.ROIs.length;j++)
                  {
                     _imgs[v.ROIs[j].roi.fileID] = v.ROIs[j].roi;
                     rois[v.ROIs[j].roi.fileID] = 1;
                  }


               }

           var ats = Object.keys(atlass);
           var imgs = Object.keys(_imgs);

			
		   that.$container.find(".KRoistat").remove();


           for (var kk = 0; kk < ats.length; kk++)
           {
                
                var atl = atlass[ats[kk]];
                var $sdiv = $("<div class='KRoistat'> <h2>"+atl.filename+"</h2></div>").appendTo(that.$container);
				
				var r = atl.content;
				var totsz = r.sizes[0]*r.sizes[1]*r.sizes[2];					
			
				var $idiv = $("<div class='KRoistat_sub'> </div>").appendTo($sdiv);

                for (var j=0;j< imgs.length;j++)
                {
                        var name;
                        if (_imgs[imgs[j]].currentFilename != undefined)
                            name = _imgs[imgs[j]].currentFilename
                        else
                            name = _imgs[imgs[j]].filename

					    $("<h3>" + name + "</h3>").appendTo($idiv);			

					    var $div = $("<div class='KViewPort_tableViewer_outerDiv'>").appendTo($idiv);
					    $table =  $("<table class='KViewPort_tableViewer' ></table>").appendTo($div);
						var $head = $("<thead>")
						var $body = $("<tbody>")

						var $row = $("<tr ></tr>");
						$row.appendTo($head);
						var $span = $("<span> Name </span>");
						$row.append($("<td></td>").append($span));	
						var $span = $("<span> Size (mm) </span>");
						$row.append($("<td></td>").append($span));	
						if (!rois[imgs[j]])
						{
							var $span = $("<span> mean </span>");
							$row.append($("<td></td>").append($span));	
							var $span = $("<span> stdev </span>");
							$row.append($("<td></td>").append($span));	
							var $span = $("<span> z </span>");
							$row.append($("<td></td>").append($span));	
						}
						else
						{
							var $span = $("<span> overlap </span>");
							$row.append($("<td></td>").append($span));								
							var $span = $("<span> dice </span>");
							$row.append($("<td></td>").append($span));								
						}

                        var nii
                        if (_imgs[imgs[j]].nii != undefined)
                            nii = _imgs[imgs[j]].niiOriginal
                        else
                            nii = _imgs[imgs[j]].content;
						var stats = computeStats(atl,nii);
						var scale = nii.datascaling.e;
						var keys = Object.keys(stats);
						for (var k = 0; k <keys.length;k++)
						{


							var $row = $("<tr ></tr>");
							$row.appendTo($body);


							var s = stats[keys[k]];
                            if (s.label)
							    var $span = $("<span> "+ s.label.name+"</span>");							    
							else
                                var $span = $("<span> undefined</span>");    							
							$row.append($("<td></td>").append($span));		    
							var vvol = r.voxSize[0]*r.voxSize[1]*r.voxSize[2];
							var $span = $("<span> "+ niceFormatNumber(s.cnt*vvol) +"</span>");
							$row.append($("<td></td>").append($span));		    
							if (!rois[imgs[j]])
							{
								var $span = $("<span> "+ niceFormatNumber(s.mean) + " / " + niceFormatNumber(scale(s.mean)) +"</span>");
								$row.append($("<td></td>").append($span));		    
								var $span = $("<span> "+  niceFormatNumber(s.std) + " / " + niceFormatNumber(scale(s.std))+"</span>");
								$row.append($("<td></td>").append($span));		    
								var $span = $("<span> "+  niceFormatNumber(s.std/s.mean) +"</span>");
								$row.append($("<td></td>").append($span));		    
							}
							else
							{
								var $span = $("<span> "+ niceFormatNumber(s.mean*100) +"% </span>");
								$row.append($("<td></td>").append($span));		    
								var $span = $("<span> "+ niceFormatNumber(0.5*s.mean/(s.cnt + s.totcnt)) +"</span>");
								$row.append($("<td></td>").append($span));		    
							}

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
	if (fobj.content.extension != undefined && fobj.content.datatype != "float")
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


KAtlasTool.isFlatMap = function(fobj)
{
	if (fobj.content.extension != undefined)
	{
		if (fobj.content.extension.content.contentType == "application/xml" | fobj.content.extension.content.contentType ==  "text/xml")
		{
			if (fobj.content.extension.content.getElementsByTagName('FlatMap').length > 0)
				return true;
		}
	}

	if (fobj.fileinfo && fobj.fileinfo.Tag && fobj.fileinfo.Tag.search("/flatmap/")>-1)
		return true;
	return false;
}
KAtlasTool.center = function(fobj)
{

	var maxi = [-Infinity,-Infinity,-Infinity];
	var mini = [Infinity,Infinity,Infinity];
	for (var k in fobj.content.labels)
	{
		maxi =	maxi.map((x,y)=> Math.max(fobj.content.labels[k].bbox.max[y],x))
		mini =	mini.map((x,y)=> Math.min(fobj.content.labels[k].bbox.min[y],x))
	}
	
	signalhandler.send("setBBox",{max:maxi,min:mini});

		
}



KAtlasTool.updateGetPixelFun = function(atlas_nii,nii,Labels,R,def,fromWorld)
  {

/*
         if (typeof Labels == "number")
         {
		     var Labels_ = {} ;
			 Labels_[Labels] = atlas_nii.labels[Labels];
			 Labels = Labels_

         }
	*/

		 var edges;
		 if (fromWorld)
		 	edges = math.diag([1,1,1,1]);
		 else
			edges = nii.edges;

	    var offset=0;

		if (nii != undefined && nii.currentTimePoint != undefined && nii.currentTimePoint.t < atlas_nii.sizes[3])	  
		   offset=nii.currentTimePoint.t*atlas_nii.widheidep;
	  
	
		 if (def != undefined)
		  {
			   var A;
			   if (def.invedges == undefined)
			   		def.invedges = math.inv(def.edges);

			   if (R == undefined)
				   A = ( math.multiply(def.invedges, edges ) )._data;
			   else
				   A = (math.multiply(math.multiply( math.multiply(def.invedges, KViewer.reorientationMatrix.matrix), edges ),R) )._data;
			
			   var B;
			   if (atlas_nii.invedges)			   
				   B = atlas_nii.invedges._data;
			   else
			   	   B = math.inv(atlas_nii.edges)._data;
			   
			   atlas_nii.A = A
			   if (Labels == undefined)
			   {
				   return function(px,py,pz)
				   {
					  var ps = [0,0,0,1];
					  for (var j=0;j<3;j++ )
						 ps[j] = trilinInterp(def,px,py,pz,A,def.sizes[0]*def.sizes[1]*def.sizes[2]*j); 
					  return NNInterp(atlas_nii,ps[0],ps[1],ps[2],B,offset); 
				   }  	
			   }
 			   else if (typeof Labels == "number")
 			   {
			  	 return function(px,py,pz)
				  {
					  var ps = [0,0,0,1];
					  for (var j=0;j<3;j++ )
						 ps[j] = trilinInterp(def,px,py,pz,A,def.sizes[0]*def.sizes[1]*def.sizes[2]*j); 
					  return trilinInterp_MAP(atlas_nii,ps[0],ps[1],ps[2],B,offset,Labels); 
				  }
			   }			   
			   else if (Object.keys(Labels).length > 0)
			   {
				   
				   return function(px,py,pz)
				   {
					  var ps = [0,0,0,1];
					  for (var j=0;j<3;j++ )
						 ps[j] = trilinInterp(def,px,py,pz,A,def.sizes[0]*def.sizes[1]*def.sizes[2]*j); 
					  return trilinInterp_atlas(atlas_nii,ps[0],ps[1],ps[2],B,offset,Labels);     
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
			  {
				  A = ( math.multiply(math.inv(atlas_nii.edges), edges ) )._data;                   
			  }
			  else
				  A = (math.multiply(math.multiply( math.multiply(math.inv(atlas_nii.edges), KViewer.reorientationMatrix.matrix), edges ),R) )._data;
			

			  if (isIdentity(A))
			      A = math.eye(4)._data;


			   atlas_nii.A = A

			  if (Labels == undefined)
			  {
			  	 return function(px,py,pz)
				  {
                     return NNInterp(atlas_nii,px,py,pz,A,offset);         				        
				  }
			  }
			  else if (typeof Labels == "number")
			  {
			  	 return function(px,py,pz)
				  {
                      return trilinInterp_MAP(atlas_nii,px,py,pz,A,offset,Labels);         				        
				  }
			  }
			  else if (Object.keys(Labels).length > 0)
			  {
			  	if (isIdentity(A))
				  return function(px,py,pz)
				  {
                     return NNInterp_atlas(atlas_nii,Math.round(px),Math.round(py),Math.round(pz),offset,Labels);         				        
				  }
			  	else
				  return function(px,py,pz)
				  {

                     return trilinInterp_atlas(atlas_nii,px,py,pz,A,offset,Labels);     
    				        
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

    var panel = KPanel($(document.body),atlas.fileID,"Atlas: " + atlas.filename.replace(".nii","").replace(".gz",""));
 	panel.closeOnCloseAll = true
 	panel.persistentLabels={};
    panel.$container.addClass("panel_floatable_simple_resize");
    panel.$container.css('height','300px')


	panel.getState = function()
	{
        var state = { 
                visible:panel.visible,
			    alpha:atlas.content.alpha,
			    persistentLabels:panel.persistentLabels};
		return state
		
	}

	panel.computeCentroids = function(nii)
	{
		for (var z = 0; z < nii.sizes[2]; z++)
		for (var y = 0; y < nii.sizes[1]; y++)
		for (var x = 0; x < nii.wid; x++)
		{
			var l = nii.data[x+nii.wid*y+nii.widhei*z];
			if (l>0)
			{
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
		}

		for (var x in nii.present_labels)
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
				nii.labels[x].size = nii.labels[x].size*nii.voxSize[0]*nii.voxSize[1]*nii.voxSize[2]/1000;
			}
			else
				delete nii.labels[x];
		}

	}


    //////// compute centroids
	var hasCentroids = false;
 	for (var k in atlas.content.present_labels)
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
		panel.computeCentroids(atlas.content)
	}



	panel.setPersistent = function (labels)
	{		
			panel.persistentLabels = {};
			var larr = [];
			for (x in labels)
			{
				var l =  atlas.content.labels[x];
				larr.push(l.name)
				panel.persistentLabels[x] = l;
			}
			console.log(larr.join(", "))
			updatePersistentLabels(false);
//			signalhandler.send('positionChange');
	    	signalhandler.send("updateImage",{id:atlas.fileID});
	}
	panel.showAll = function(all)
	{
		    panel.persistentLabels = {};
			$body.find("tr").map(function() { 
			        var key = $(this).attr("value");
                    if ($(this).is(":visible") | all)       
			            panel.persistentLabels[key] = atlas.content.labels[key]; });
			updatePersistentLabels(false);
	    	signalhandler.send("updateImage",{id:atlas.fileID});
		
	}
	panel.hideAll = function()
	{
		$hideAll.trigger("click")
	}

    var $fileRow = $("<div class='roiTool_panel_flex_persistent'></div>").appendTo(panel.$container);
    var $showAll = $("<a class='KViewPort_tool'><span> Show all </span></a>").appendTooltip("show all regions permanently").click(
		function(e)
		{
			panel.showAll();
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


    var $outlines = $("<a class='KViewPort_tool'><span> Outlines </span></a>").appendTooltip("show outlines and labeling").click(
		function(e)
		{
	    	signalhandler.send("updateImage",{id:atlas.fileID,outlines:true});
		}
    )
    $fileRow.append($outlines).append($("<i class='flexspacer'></i>"));

    var $center = $("<a class='KViewPort_tool'><span> center </span></a>").appendTooltip("center atlas").click(
		function(e)
		{
	    	KAtlasTool.center(atlas);
		}
    )
    $fileRow.append($center).append($("<i class='flexspacer'></i>"));
	
  var $flipLR = $("<a class='KViewPort_tool'><span> flipLR </span></a>").click(
		function(e)
		{
			var np = {};
			var map = {}
			var a = [["_L","_R"]];
			for (var j in atlas.content.labels)
				{
					map[atlas.content.labels[j].name] = atlas.content.labels[j];
				}
			for (var k in panel.persistentLabels)
				{
					var n = panel.persistentLabels[k].name;
					var j = 0;
					var s = n.replace(a[j][0],a[j][1]);
					if (map[s] != undefined)
						np[map[s].key] = map[s];
					
				}		

			var oldkey = "ROI_ATLAS_" + atlas.fileID + "_" + Object.keys(panel.persistentLabels).join(",")

			panel.persistentLabels = np;
			updatePersistentLabels(false);
	    	signalhandler.send("updateImage",{id:atlas.fileID});

			if (KViewer.roiTool.getCurrentGlobal() && KViewer.roiTool.getCurrentGlobal().fileID == oldkey)
				updateAtlasLabelSet(atlas,KViewer.roiTool.getCurrentGlobal())
			
		}
    )
    $fileRow.append($flipLR).append($("<i class='flexspacer'></i>"));

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
    /*
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
  
    */


	if (state != undefined)
    {
    	if (state.alpha != undefined)
    	    atlas.content.alpha = state.alpha;
    }




    var $stats = $("<a class='KViewPort_tool'><span> Stats </span></a>").appendTooltip("compute statistics over contrasts").click(function(){ 
    	 KViewer.atlasTool.statdlg.toggle();
         KViewer.atlasTool.statdlg.dostats();})
    $fileRow.append($stats).append($("<i class='flexspacer'></i>"));
 
    var $alpha = $("<a class='KViewPort_tool'><span> alpha </span> <input style='height:15px;width:40px' min=0.1 max=1 step=0.1 type='number' value='"+atlas.content.alpha+"'> </a>")
    $fileRow.append($alpha).append($("<i class='flexspacer'></i>"));
	var $input = $alpha.find("input");
	$input.on("change",function(){
		atlas.content.alpha = parseFloat($input.val())
		signalhandler.send("updateImage",{id:atlas.fileID});

		//signalhandler.send("positionChange");
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
	var $span = $("<span> Size (mL) </span>");
	$row.append($("<td ></td>").append($span));	

	


	
	function setCurrentLabel(k,scrollTo)
	{
		if (k != -1)
		{
			$body.find(".selected").removeClass("selected");
			var $row = $body.find("tr[value="+k+"]")
			$row.addClass("selected");	
			if ($row.length > 0 && scrollTo && panel.currentLabel != k)
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
	



	if (state != undefined)
    {
    	if (state.persistentLabels)
    		for (var k in state.persistentLabels)
    		{
    		    if (atlas.content.labels[k] != undefined)    		    
    			    atlas.content.labels[k].color = state.persistentLabels[k].color    	
    		}
    }	


	panel.update = function()
	{
		$body.children().remove()
	    for (var k in atlas.content.present_labels)
	    {
	    	var label =  atlas.content.labels[k];
	    	if (label == undefined)
	    	    continue;
	
	       var dragstuff = "class='atlasdrag' draggable='true' data-type='file' data-mime='nii' data-tag='/roi/' data-intent='labelname:\""+label.name+"\",atlaskey:"+label.key+"'  data-fileID='"+atlas.fileID+"' data-filename='"+atlas.filename+":"+label.name+"' ";
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
						if (($(y).is(":visible")))
						{
							if (panel.persistentLabels[a])
								delete panel.persistentLabels[a];
							else
								panel.persistentLabels[a] =atlas.content.labels[a];
						}
					 } )
					 updatePersistentLabels(true);
			     	 signalhandler.send("updateImage",{id:atlas.fileID});
			    }
			    else
			    {
					setCurrentLabel(k)
					var label = atlas.content.labels[k]
					atlas.currentLabel = label; 
					KViewer.currentPoint = math.matrix(label.centroid);
	       		    KViewer.atlasTool.update();		
	
					signalhandler.send('labelChange positionChange');								
			    }
	
			} }(k,$row));
		
			$row.appendTo($body);
	
			var $colselector = KColorSelector(KColor.list,	
				 function(c) {	
				 return "background:"+RGB2HTML(c[0],c[1],c[2])+";"; },
				 function(label) { return function (col)
				 {
					label.color =  KColor.list[label.color];
	
	    	    	signalhandler.send("updateImage",{id:atlas.fileID});
	
				 } }(label),
				 label);
	
			$colselector.removeClass("KViewPort_tool_cmap");
	
		    $row.append($colselector);
	//	    $row.append($("<td style='background-color:"+RGB2HTML(label.color[0],label.color[1],label.color[2])+";'  ></td>"));
	
			var $span = $("<span> "+label.name+" ("+label.key+") </span>");
			$row.append($("<td></td>").append($span));	
			var $span = $("<span> "+label.size+" </span>");
			$row.append($("<td></td>").append($span));	
	
	    }
	}	

    panel.update()

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
    		for (var k in panel.persistentLabels)
    		{
    			if (atlas.content.labels[k] != undefined)    			
    			    atlas.content.labels[k].color = panel.persistentLabels[k].color
    		}
    		updatePersistentLabels(false);
    	}
    	if (state.visible != undefined)
    	{
    	    if (!state.visible)	
    	        panel.hide();
    	}
    	
    }

	return panel;

}