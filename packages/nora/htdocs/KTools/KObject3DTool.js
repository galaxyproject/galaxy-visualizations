
// ======================================================================================
// ======================================================================================
// ============= KObject3DTool
// ======================================================================================
// ======================================================================================

function KObject3DTool(master)
{
  /** objects that are typically looked in 3D like fiber tracts/surfaces/ccmats are controlled from here
   * @class 
   * @alias KObject3DTool
   * @augments KToolWindow
   */
  var that = new KToolWindow(master,
  $("<div class='KView_tool '><i class='fa fa-cubes fa-1x'></i></div>")
  .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Objects 3D</li>")) ) );
  
   that.$topRow.addClass("Obj3DTool_topmenu")

  var fibertool = master.obj3dTool;

  that.tracking_panel = KTrackingPanel();
  that.tracking_panel.toggle();


  that.name = 'Objects 3D';
  
  // the list of 3D objects as key/value pairs
  that.objs = {};


  // the top menu
  var $menu = $("<ul class='KView_tool_menu'></ul>");

  that.$topRow.append( $("<li ><a>Objects 3D</a></li>").append($menu) );

  $menu.append($("<li><a>Object Statistics</a> </i></li>").click(function() 
    {
        that.statdlg.toggle();
        that.statdlg.dostats();
    }
    ));

  that.statdlg = statistics_dialog(that);

  // that tool table 
  var $innerDIV = $("<div ondragover='event.preventDefault();' class='annotation_tool_listDIV'></div>").appendTo(that.$container);
  var $table = $("<table  class='localfiletable'></table>").appendTo($innerDIV);
  
  // drop handler 
  $innerDIV.on("drop",function(e)
  {
    e.preventDefault();
    var params = getloadParamsFromDrop(e.originalEvent,undefined);
  	if (params.length > 0)
  	{
		params[0].progressSpinner = that.progressSpinner;
		params[0].callback = that.hideSpinner;
		master.dataManager.loadData(params[0]);
  	}
  });

  // resize handler
  that.resize = function(hei)
  {
      that.$container.height(hei);
      $innerDIV.height(hei-that.$container.find('.KToolsTopMenu').height());
      
  }


  /***************************************************************************************
   *  object management
   ****************************************************************************************/

 
  that.addObject = function (fileObject)
  {
       that.objs[fileObject.fileID] = fileObject;
       that.update();
  }


  that.clearAll = function ()
  {
      var obs = Object.keys(that.objs);
      for (var k = 0; k< obs.length;k++)
      		delete that.objs[obs[k]].content;
      KViewer.obj3dTool.objs = {};
      KViewer.obj3dTool.update();

  }


  that.uid_cnt = 0;
  

  that.cloneFibersFromSelection = function (tck,viewer,parent,name)
  {
  	  var fobj = tck.fibers;
  	  var children; 	  
  	  if (tck.isParentView)
  	  	 children = tck.children;
  	  else
  	     children = tck.parent.children;

  	  if (tck.trackingVol == undefined)
  	  {
		  if (fobj.content.selections == undefined)
				fobj.content.selections =[];
		  var max = 0;
		  for (var k = 0 ; k < children.length;k++)
		  {
		  		if (children[k].Selection != undefined) 
					if (children[k].Selection.name.substring(0,9) == 'selection')
						max = Math.max(max,parseInt(children[k].Selection.name.substring(9)));
		  }
		  if (name == undefined)
		  	name = 'selection' + (max+1);
		  fobj.content.selections.push({subset: tck.subsetToDisplay, name:name, signs:tck.fiberSign});
		  that.update();  	  

		  return that.createFiberView(fobj,viewer,{select: tck.fibers.content.selections.length-1 , parent:parent, donotmakecurrent:true});
  	  }
  	  else
  	  {
  	  	 var fobj_ = {content:{tracts : fobj.content.tracts,
  	  	 					   tracts_max : fobj.content.tracts_max,
  	  	 					   tracts_min : fobj.content.tracts_min,
  	  	 					   tracts_len : fobj.content.tracts_len,
  	  	 					   tot_points : fobj.content.tot_points,
  	  	 					   max : fobj.content.max,
  	  	 					   min : fobj.content.min } };

		 var max = 0;
		 for (var k = 0 ; k < children.length;k++)
		 {
				if (children[k].fibers.filename.substring(0,9) == 'selection')
					max = Math.max(max,parseInt(children[k].fibers.filename.substring(9)));
		 }
		 if (name == undefined)
			 name = 'selection' + (max+1);

		 that.buildOctree(fobj_.content,that.progressSpinner);				 
  	  	 fobj_.filename = name;

  	  	 var intent = {parent:parent, donotmakecurrent:true}
		 if (tck.subsetToDisplay != undefined)
		 {
		 	 fobj_.content.selections = [{subset: tck.subsetToDisplay, name:name}];
		 	 intent.select = 0;
		 }

		 that.update();  	  
		 return  that.createFiberView(fobj_,viewer,intent);
  	  }
  }


  /***************************************************************************************
   *  table updater 
   ****************************************************************************************/

  that.update = function()
  {
    $table.children().remove();
  
    var $thead = $("<thead>").appendTo($table);
    var $row = $("<tr class='filecache'></tr>").appendTo($thead);
    $row.append($("<td  class='fixedwidth' fixedwidth='6'><i class='fa fa-fw fa-square-o'></i> </td>"));
    $row.append($("<td>name </td>"));
    $row.append($("<td>type</td>"));
    $row.append($("<td class='fixedwidth' fixedwidth='6'></td>"));
    $row.append($("<td class='fixedwidth' fixedwidth='6'></td>"));
    $row.append($("<td>info</td>"));

  
    var $tbody = $("<tbody>").appendTo($table);
    for  (var k in that.objs)
    {
	   var id = that.objs[k].fileID;
    	
       var dragstuff = "draggable='true' data-type='file' data-filename='"+that.objs[k].filename+"' data-fileID='"+that.objs[k].fileID+"' data-mime='tracts'";
       dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";
       var $row = $("<tr class='maintck' " + dragstuff + "></tr>").appendTo($tbody);
       $row.append($("<td><i class='fa fa-fw fa-circle-o'></i> </td>").click(function(e){ 
    
			var toselect = $(e.target).parent();
			if (!$(e.target).parent().is("tr"))
			  toselect = toselect.parent();
			toselect = toselect.nextAll();
			for (var k = 0; k < toselect.length;k++)
			{
				var to = $(toselect[k]).find(".fa-square-o,.fa-check-square-o");
				if (to.length > 0)
					toggle_file(to);
			    else
			    	break;
			}
			return false;

        }));      
       
       $row.append($("<td >" + that.objs[k].filename + "</td>"));
       $row.append($("<td>" + that.objs[k].contentType + "</td>"));
       if (that.objs[k].contentType == 'tracts'  & that.objs[k].content.selections != undefined) 
  	   		$row.append($("<td> <i class='fa tablebutton fa-fw fa-save'></td>").click(function(t) { return function() { that.save(t) } }(that.objs[k])));
       //if (that.objs[k].contentType == 'gii' && that.objs[k].content.nifti != undefined && that.objs[k].content.nifti.labels == undefined ) 
  	   //		$row.append($("<td> <i class='fa  fa-fw fa-refresh'></td>").click(function(t) { return function() { 
  	   //		that.computeIsoSurf(t);  
  	   //		for (var j=0;j < t.content.update.length;j++) t.content.update[j]();
  	   //		} }(that.objs[k])));

	   $row.append($("<td> <i class='tablebutton fa fa-fw fa-close'></td>").click(function(k) {return function(ev){

	   		   ignoreDblClickBeforeClose(ev);
	   			ev.preventDefault();
			    if (that.objs[k].fileinfo.roireference != undefined)
			    	delete that.objs[k].fileinfo.roireference.fileinfo.surfreference;
		
				KViewer.iterateMedViewers(function (medViewer) {
					for (var i = 0; i < medViewer.objects3D.length; i++)
						if (medViewer.objects3D[i].surf == that.objs[k])
							medViewer.objects3D[i].close();
				});

			   	delete that.objs[k];
			   	that.update();
			   } }(k) ));

	  if (that.objs[k].contentType == 'tracts')
	         $row.append($("<td > tracts:" + that.objs[k].content.tracts.length+ "</td>"));

	   if (that.objs[k].content.Contours != undefined)
	   {
			for (var j = 0; j < that.objs[k].content.Contours.length;j++)
			{
			   var selection = that.objs[k].content.Contours[j];
               var dragstuff = "draggable='true' data-type='file' data-filename='tck:"+selection.name+"' data-fileID='"+that.objs[k].fileID+"'  data-mime='contour' data-intent='select:"+j+"'";
                
               dragstuff += " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";
			   var $row = $("<tr class='filecache' " + dragstuff + "'></tr>").appendTo($table);
     		   $row.append($("<td><i class='fa fa-fw fa-square-o'></i> </td>").click(function(e){ toggle_file(e.target); return false; }));      
			   
			   $row.on("contextmenu", function (ev) { formContextMenu(ev); });
               var $namediv = $("<td>" + selection.name + "</td>");
               $row.append($namediv);
               
               

			   $row.append($("<td> contour </td>"));
 			   
			   $row.append($("<td> <i class='fa tablebutton fa-fw fa-close'></td>").click(function(k,j) {return function(ev){
				   ignoreDblClickBeforeClose(ev);
				   ev.preventDefault();
					that.objs[k].content.selections.splice(j,1);
					that.update();
			   } }(k,j) ));

			   $row.click(function(ev){
				  if (ev.ctrlKey)
				  	toggle_file(ev.target);

			   })



			}


	   }
			  
  	   		


	   if (that.objs[k].content.selections != undefined)
	   {
            var list_to_sort = []
			for (var j = 0; j < that.objs[k].content.selections.length;j++)
				list_to_sort.push({id:j,name:that.objs[k].content.selections[j].name})
            
            list_to_sort.sort(function(a,b) {return (a.name > b.name)?1:-1 })

			for (var j_ = 0; j_ < that.objs[k].content.selections.length;j_++)
			{
			   var j = list_to_sort[j_].id;
			   var selection = that.objs[k].content.selections[j];
               var dragstuff = "draggable='true' data-type='file' data-filename='tck:"+selection.name+"' data-fileID='"+that.objs[k].fileID+"'  data-mime='tracts' data-intent='select:"+j+"'";
                
               dragstuff += " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";
			   var $row = $("<tr class='filecache' " + dragstuff + "'></tr>").appendTo($table);
     		   $row.append($("<td><i class='fa fa-fw fa-square-o'></i> </td>").click(function(e){ toggle_file(e.target); return false; }));      
			   
			   $row.on("contextmenu", function (ev) { formContextMenu(ev); });
               var $namediv = $("<td>" + selection.name + "</td>");
               $row.append($namediv);
               if (selection.namedivs == undefined)
               	  selection.namedivs = {};
			   selection.namedivs.manager = $namediv;
			
               $namediv.keydown(function(ev) { if (ev.keyCode == 13) { $(ev.target).blur(); return false } })
               .keyup(  function(sel) { return  function(ev) 
			   {
			   		sel.name = $(ev.target).text(); 
			   		if (sel.namedivs != undefined)
			   		{
			   			for (var i in sel.namedivs)
			   			{
			   				//if (sel.namedivs[i].constructor.name == 'm')
			   					$(sel.namedivs[i]).text(sel.name);
			   			}
			   		}
			   } }(selection)
               ).on('blur', that.update);


              makeEditableOnDoubleClick($namediv);


			   $row.append($("<td> tractselection </td>"));
  	   	  	   $row.append($("<td> <i class='fa tablebutton  fa-fw fa-save'></td>").click(function(t,s) { return function() { that.save(t,s) } }(that.objs[k],selection)));
 			   
			   $row.append($("<td> <i class='fa tablebutton fa-fw fa-close'></td>").click(function(k,j) {return function(ev){
				   ignoreDblClickBeforeClose(ev);
				   ev.preventDefault();
					that.objs[k].content.selections.splice(j,1);
					that.update();
			   } }(k,j) ));

			   $row.click(function(ev){
				  if (ev.ctrlKey)
				  	toggle_file(ev.target);

			   })

			   if (that.objs[k].contentType == 'tracts')
	         		$row.append($("<td > tracts:" +that.objs[k].content.selections[j].subset.length+ "</td>"));



			}

	   }
		

    }       
    that.attachTableOperator($table.parent());

  }


    function toggle_file(target)
    {
      if (!$(target).hasClass("fa"))
         target = $(target).parent().find(".fa");
      toggle(target);
    }

    function toggle(target)
    {
      if (target.length > 1)
		target = target[0];
      $(target).toggleClass("fa-square-o");
      $(target).toggleClass("fa-check-square-o");
      $(target).parent().parent().toggleClass("selected");
    }

  that.saveTCK = function(tck)
  {
  	 if (tck.Selection.name != undefined)
  	 	tck.fibers.filename = tck.Selection.name.trim()

  	 var fibers = tck.fibers
  	 var content = fibers.content;
  	 var utf8encoder = new TextEncoder()
  	 var hdr = "mrtrix tracks\ndatatype: Float32LE\ncount: "+ content.tracts.length + "\nfile: . 1024\nEND";
  	 var buf = new ArrayBuffer(1024+ ((content.tot_points*4)*3 + content.tracts.length*4*3 ));
  	 var uint8 = new Uint8Array(buf)
     var hdrbuf = utf8encoder.encode(hdr);
  	 uint8.set(hdrbuf);
    
     var nanbuf = new Float32Array(3)
     nanbuf[0] = NaN
     nanbuf[1] = NaN
     nanbuf[2] = NaN

     var offs = 1024
     for (var k = 0; k < content.tracts.length;k++)
     {
        uint8.set(new Uint8Array(content.tracts[k].buffer),offs);
        offs = offs + content.tracts[k].buffer.byteLength;
        uint8.set(new Uint8Array(nanbuf.buffer),offs);
        offs = offs + nanbuf.buffer.byteLength;
     }


     fibers.content.buffer = buf;

    fibers.fileinfo = {};
    fibers.fileID = "TCK_1"
    fibers.filename = fibers.filename.replace("\.tck","")
    fibers.filename = fibers.filename + ".tck"

	// add a unique patient id first if not set
	if (fibers.fileinfo.patients_id == undefined)
	   extendWithUniquePSID(fibers.fileinfo);

	var zipped = false;

	if (fibers.fileinfo.patients_id != undefined)
	 {
			uploadUnregisteredBinary(fibers, {
				SubFolder: "",
				permission: "rwp"
			}, that.progressSpinner,
			function(newid, id) {

			},zipped);
	}
	else
	{
		alertify.alert("There is no unique patient id set for this file.")
	}
      	 
  	 
  }


  // save a selection as json
  that.save = function(fibers,selection,donotupload)
  {
      var sels;
      var name;
      if (selection != undefined)
      {
      	sels = [selection];
      	name = selection.name;
      }
      else
      	sels = fibers.content.selections;

	  var csels = [];
	  for (var k = 0; k < sels.length; k++)
	  {
	  	  csels[k]= $.extend(false,{},sels[k]);
	  	  csels[k].namedivs = undefined;
	  	  delete csels[k].namedivs;
	  }

  	  var obj = {assoc: {fileID:fibers.fileID,filename:fibers.filename,subfolder:fibers.fileinfo.SubFolder,filepath:fibers.fileinfo.FilePath,md5:fibers.content.md5},
  	             selections: csels };
  	  if (donotupload != undefined && donotupload == true)
		  return obj;


 	  if (name != undefined)
		 uploadJSON(name,obj,{patients_id:fibers.fileinfo.patients_id,studies_id:fibers.fileinfo.studies_id,subfolder:fibers.fileinfo.SubFolder,tag:'TCKSEL'},function(fobj)
		 {
			fibers.tckjsonref = fobj ;
		 });					
	  else  	  
	  {
	  	 if (electron)
			 uploadJSON("tract_selections.tck.json",obj,{subfolder:fibers.fileinfo.SubFolder,tag:'TCKSEL'},function(fobj){
			 	fibers.tckjsonref = fobj;
			 });					
	  	 else
	  	 {
	  	 	 var def = that.lastSelectionName;
	  	 	 if (def == undefined)
	  	 	 {
                if (fibers.fileinfo.SubFolder != undefined | fibers.fileinfo.SubFolder != "")
	  	 	 	    def = fibers.fileinfo.SubFolder + "/tract_selections";
	  	 	 	else 
	  	 	 	    def = "tract_selections";
	  	 	 }
			 alertify.prompt("Enter a name for fiber selections", function(e,name)
			 {
				if (e)
				{
					that.lastSelectionName = name;
					var sp = name.split("/");
					var name = sp[sp.length-1];
					var subfolder = sp.splice(0,sp.length-1).join("/");
					uploadJSON(name,obj,{subfolder:subfolder,tag:'TCKSEL'},function(fobj){
						fibers.tckjsonref = fobj
					});					
				}
			 } ,def);
	  	 }

	  }

	  return obj;

  }


  /***************************************************************************************
   *  context menu
   ****************************************************************************************/


  var fiberContextMenu = KContextMenu(
  function(ev) {

      var target = ev.target;
      for (var k = 0;k< 3;k++)
      {
        if ($(target).is("tr"))
           break;
        target = $(target).parent();
      }
      prepObjectInfo(target);


      var $menu = $("<ul class='menu_context'>")

      $menu.append($("<li onchoice='save' >save</li>"));

      return $menu;
  },
  function (str,ev)
  {
      if (str=="save")
      {
      }
  });



  /***************************************************************************************
   *  creation of 3D objects from volume data
   ****************************************************************************************/

	that.createSurfaceFromROI = function(fobj,ondone,thres,progress)
	{
		var labelObj;
		if (thres != undefined)
		 labelObj = {threshold:thres};

		if (progress == undefined)
			progress = that.progressSpinner;

		if (fobj.fileinfo.surfreference != undefined)
		{
			var fileObject = fobj.fileinfo.surfreference;
			that.computeIsoSurf2(fileObject,labelObj,progress,function()
			{ 
				for (var j=0;j < fileObject.content.update.length;j++) 
					fileObject.content.update[j]();			
			});
		    return;
		}


		var fileObject = {};
		fileObject.content =  {nifti:fobj.content,buffer:undefined,update:[] };

		fileObject.fileID = 'SURF_' + KObject3DTool.uidCnter++;
		fileObject.filename = 'surf.' + fobj.filename;
		fileObject.contentType = 'gii';
		fileObject.fileinfo = {roireference:fobj};
		fobj.fileinfo.surfreference = fileObject; 

		fileObject.content.min = math.multiply(fobj.content.edges,[0,0,0,1])._data;
		fileObject.content.max = math.multiply(fobj.content.edges,[
		fobj.content.sizes[0],fobj.content.sizes[1],fobj.content.sizes[2],1])._data;


		// forward an update callback from the roi if desired
		if(fobj.update != undefined)
			fileObject.content.update.push(fobj.update);

		progress("creating isosurface");
	
  	    that.computeIsoSurf2(fileObject,labelObj,progress,function(){
			progress();
			
			if (ondone)
				ondone(fileObject);
  	    });


	}


	that.createSurfaceFromAtlas = function(fobj,label,ondone)
	{

		var fileObject = {};
		fileObject.content =  {nifti:fobj.content,buffer:undefined,update:[] };

		fileObject.fileID = 'SURF_' + KObject3DTool.uidCnter++;
		fileObject.filename = 'surf.' + ((label==undefined)?"unknown":label.name);
		fileObject.contentType = 'gii';
		fileObject.fileinfo = {};

		var Labels;

		if (label)
		{
			if (label.key != undefined) // thats a single label
			{
				label.surfacereference = fileObject;
				Labels = parseInt(label.key);
			}
			else
			{
				Labels = label;
			}
		}
		
		that.progressSpinner("creating isosurface");
	
		that.computeIsoSurf2(fileObject,Labels,that.progressSpinner,function()
		{

			KViewer.dataManager.setFile(fileObject.fileID,fileObject);
			KViewer.cacheManager.update();

			KViewer.obj3dTool.addObject(fileObject);

			if (!that.enabled)
				 KViewer.obj3dTool.$toggle.trigger("click");		

			that.progressSpinner();

			if (ondone)
				ondone(fileObject);
		});


	}







		function smooth(verts,trigs)
		{
			var verts_sm = new Float32Array(verts.length);
			var ncnt = new Int32Array(verts.length/3);
			for (var k=0;k<trigs.length/3;k++)
				{
					var v = [0,0,0];
					for (var j = 0; j < 3;j++)
					{				
						for (var i = 0; i < 3; i++)
						   v[i] += verts[3*trigs[3*k+j]+i]*0.3333;
					}
					for (var j = 0; j < 3;j++)
					{				
						for (var i = 0; i < 3; i++)
						   verts_sm[3*trigs[3*k+j]+i] += v[i];
						ncnt[trigs[3*k+j]]++;
					}

				}
			for (var k = 0; k < verts.length/3;k++)
			{
				verts_sm[3*k] /= ncnt[k];
				verts_sm[3*k+1] /= ncnt[k];
				verts_sm[3*k+2] /= ncnt[k];
			}
			return verts_sm;
		}




	that.computeIsoSurf2 = function(fobj,label,progress,done)
	{


		if (fobj.cache == undefined)
			fobj.cache = {};

		var key = JSON.stringify(fobj.content.nifti.currentTimePoint) 

		if (fobj.cache[key] != undefined && !(fobj.filename && fobj.filename.search("pointROI")>-1 ))
		{

            if (fobj.changed)  
            {
            	if (fobj.changed && fobj.content.nifti.currentTimePoint &&
             	 fobj.changed[fobj.content.nifti.currentTimePoint.t] == undefined)
            	 {
     				$.extend(fobj.content,fobj.cache[key] );
	  				done(fobj);
					return;
            	 }
            	 else
                    fobj.changed[fobj.content.nifti.currentTimePoint.t] = undefined;
            	 
            }          
			else if (fobj.cache[key].last_label == JSON.stringify(label))
			{
				$.extend(fobj.content,fobj.cache[key] );
				done(fobj);
				return;
			}


		}

		executeImageWorker.createIsoSurf_running = true

		progress("creating isosurface");
		var worker = executeImageWorker({func:'createISOSurf', 
				data:fobj.content.nifti.data,
				sizes:fobj.content.nifti.sizes,
				edges:fobj.content.nifti.edges,
				currentTimePoint:fobj.content.nifti.currentTimePoint,
				detsign:fobj.content.nifti.detsign,
				label:label

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
        		executeImageWorker.createIsoSurf_running = undefined
					
				$.extend(fobj.content,e.execObj);
				fobj.cache[key] = e.execObj;
				fobj.cache[key].last_label = JSON.stringify(label);
				done(fobj);

			}
			);

		return worker;


	}

/*

	that.computeIsoSurf = function(fobj,label)
	{

		var nii = fobj.content.nifti;
		var data = nii.data;
		var sizes = nii.sizes;

		var w = sizes[0];
		var h = sizes[1];
		var d = sizes[2];
		var wh = sizes[0]*sizes[1];


		var cnt = 0;
		var vertsIDX = [];
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
		var trigs = [];
		var addTrigs;
		if (nii.detsign == -1)
			addTrigs = function( i00,i10,i11,i01)
				{
					trigs.push(i00,i10,i11,i00,i11,i01);
				}
		else
			addTrigs = function( i00,i10,i11,i01)
				{
					trigs.push(i00,i01,i11,i00,i11,i10);
				}
		

		var compfun = function(x) { return x>0 }
		var negcompfun = function(x) { return x==0 }
		if (label)
		{
			var key = parseInt(label.key);
			compfun = function(x) {
				return x==key;
			}
			negcompfun = function(x) {
				return x!=key;
			}
		}
			 
		

		for (var z = 1; z < sizes[2]-1;z++)
		for (var y = 1; y < sizes[1]-1;y++)
		for (var x = 1; x < sizes[0]-1;x++)
		{
			var idx = z*wh + w*y + x;
			if (compfun(data[idx] > 0))
			{
				var i00,i10,i01,i11;
				if (negcompfun(data[idx-1]))
				{
					i00 = addVert(idx);
					i10 = addVert(idx+w);
					i11 = addVert(idx+w+wh);
					i01 = addVert(idx+wh);
					addTrigs(i00,i01,i11,i10);
				} 
				
				if (negcompfun(data[idx+1]))
				{
					i00 = addVert(idx+1);
					i10 = addVert(idx+1+wh);
					i11 = addVert(idx+1+w+wh);					
					i01 = addVert(idx+1+w);
					addTrigs(i00,i01,i11,i10);
				}

				if (negcompfun(data[idx-w]))
				{
					i00 = addVert(idx);
					i10 = addVert(idx+1);
					i11 = addVert(idx+1+wh);
					i01 = addVert(idx+wh);
					addTrigs(i00,i10,i11,i01);
				} 
				if (negcompfun(data[idx+w]))
				{
					i00 = addVert(idx+w);
					i10 = addVert(idx+w+wh);
					i11 = addVert(idx+w+1+wh);					
					i01 = addVert(idx+w+1);
					addTrigs(i00,i10,i11,i01);
				}

				if (negcompfun(data[idx-wh]))
				{
					i00 = addVert(idx);
					i10 = addVert(idx+w);
					i11 = addVert(idx+w+1);
					i01 = addVert(idx+1);
					addTrigs(i00,i10,i11,i01);
				} 
				
				if (negcompfun(data[idx+wh]))
				{
					i00 = addVert(idx+wh);
					i10 = addVert(idx+wh+1);
					i11 = addVert(idx+wh+w+1);					
					i01 = addVert(idx+wh+w);
	 				addTrigs(i00,i10,i11,i01);
				}
			}

		}


		var pts = Object.keys(vertsIDX);
		var verts = new Float32Array(pts.length*3);
		for (var k = 0; k < pts.length;k++)
		{
			var x = pts[k]%w -0.5;
			var y = math.floor(pts[k]/w)%h -0.5;
			var z = math.floor(pts[k]/wh) -0.5;
			var v = math.multiply(nii.edges,[x,y,z,1])._data;
			var i = vertsIDX[pts[k]];
			verts[3*i] = v[0];
			verts[3*i+1] = v[1];
			verts[3*i+2] = v[2];
		}

	   verts = smooth(verts,trigs);
	    verts = smooth(verts,trigs);
	    verts = smooth(verts,trigs);
	 


		var normal = new Float32Array(trigs.length);
	    for (var k=0;k<trigs.length/3;k++)
			{
				var t1 = trigs[3*k];
				var t2 = trigs[3*k+1];
				var t3 = trigs[3*k+2];

				var a = [verts[3*t1+0],verts[3*t1+1],verts[3*t1+2]]
				var b = [verts[3*t2+0],verts[3*t2+1],verts[3*t2+2]]
				var c = [verts[3*t3+0],verts[3*t3+1],verts[3*t3+2]]
				var n =     [(b[1]-a[1])*(c[2]-a[2]) - (b[2]-a[2])*(c[1]-a[1]), 
							 (b[2]-a[2])*(c[0]-a[0]) - (b[0]-a[0])*(c[2]-a[2]),
							 (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])];

				for (var j=0;j<3;j++)
				{	
					normal[3*trigs[3*k+j]+0] -= n[0];
					normal[3*trigs[3*k+j]+1] -= n[1];
					normal[3*trigs[3*k+j]+2] -= n[2];
				}
			}


		var c = fobj.content;
		c.points = verts;
		c.indices = trigs;
		c.normals = normal;


	}*/


  /***************************************************************************************
   *  unpacking/reading of Surface data
   ****************************************************************************************/

	that.prepareSurfaceData = function(fileObject,uint8Response,processinfo,arrived)
	{
		if (fileObject.filename.search("\\.gii") > -1)
		{

		    var scriptname = 'gifti-reader-min.js' + '?' +  static_info.softwareversion;

			scriptLoader.loadScript(scriptname, function() {

			var gii = gifti.parse(ab2str(uint8Response));
			fileObject.content = {gifti:gii,buffer:uint8Response.buffer };
			var c = fileObject.content;
			c.points = gii.getPointsDataArray();

			var max = [-99999,-99999,-99999];
			var min = [99999,99999,99999];

			if (c.points != null) c.points = c.points.getData();
			for (var k = 0;k < c.points.length/3;k++)
			{
				for (var j=0; j < 3;j++)
				{
					if (c.points[k*3+j] > max[j])
						max[j] = c.points[k*3+j];
					if (c.points[k*3+j] < min[j])
						min[j] = c.points[k*3+j];
				}

			}
			c.max = max;
			c.min = min;





			c.indices = gii.getTrianglesDataArray();
			if (c.indices != null) c.indices = c.indices.getData();
			c.normals = gii.getNormalsDataArray();
			if (c.normals != null) c.normals= c.normals.getData();
			else
			{
				c.normals = new Float32Array(c.points.length)
				for (var k = 0;k < c.indices.length/3;k++)
				{
					var a = [c.points[3*c.indices[3*k]],c.points[3*c.indices[3*k]+1],c.points[3*c.indices[3*k]+2]];
					var b = [c.points[3*c.indices[3*k+1]],c.points[3*c.indices[3*k+1]+1],c.points[3*c.indices[3*k+1]+2]];
					var d = [c.points[3*c.indices[3*k+2]],c.points[3*c.indices[3*k+2]+1],c.points[3*c.indices[3*k+2]+2]];
					var n =     [(b[1]-a[1])*(d[2]-a[2]) - (b[2]-a[2])*(d[1]-a[1]), 
								 (b[2]-a[2])*(d[0]-a[0]) - (b[0]-a[0])*(d[2]-a[2]),
								 (b[0]-a[0])*(d[1]-a[1]) - (b[1]-a[1])*(d[0]-a[0])];
					for (var j=0;j<3;j++)
					{	
						c.normals[3*c.indices[3*k+j]+0] += n[0];
						c.normals[3*c.indices[3*k+j]+1] += n[1];
						c.normals[3*c.indices[3*k+j]+2] += n[2];
					}

				}
				for (var k = 0; k < c.normals.length/3;k++)
				{
					var no = math.sqrt(c.normals[3*k]*c.normals[3*k] +c.normals[3*k+1]*c.normals[3*k+1] +c.normals[3*k+2]*c.normals[3*k+2]);
					c.normals[3*k] /= no;
					c.normals[3*k+1] /= no;
					c.normals[3*k+2] /= no;

				}

			}
			c.colors = gii.getColorsDataArray();
			if (c.colors != null) c.colors= c.colors.getData();
			if (arrived != undefined)
				arrived();

			});
		}
		else // a stl
		{

			fileObject.content = {buffer:uint8Response.buffer };
			var c = fileObject.content;

			var view = new DataView(uint8Response.buffer);
			var LE = true;
			var numTrigs = view.getUint32(80,LE);
			var pos = 84;

			var normals = [];
			var indices = [];
			var points = [];
			var vals = [];
			var bbox_max = [-10000,-10000,-10000];
			var bbox_min = [10000,10000,10000];
			
			for (var k = 0; k < numTrigs;k++)
			{
				var n = [view.getFloat32(pos,LE),view.getFloat32(pos+4,LE),view.getFloat32(pos+8,LE)];
				normals.push(n[0],n[1],n[2],n[0],n[1],n[2],n[0],n[1],n[2]);
				var p1 = [view.getFloat32(pos+12,LE),view.getFloat32(pos+16,LE),view.getFloat32(pos+20,LE)];
				var p2 = [view.getFloat32(pos+24,LE),view.getFloat32(pos+28,LE),view.getFloat32(pos+32,LE)];
				var p3 = [view.getFloat32(pos+36,LE),view.getFloat32(pos+40,LE),view.getFloat32(pos+44,LE)];
				points.push(p1[0],p1[1],p1[2]);
				points.push(p2[0],p2[1],p2[2]);
				points.push(p3[0],p3[1],p3[2]);
				for (var i = 0 ; i < 3;i++)
				{
					bbox_max[i] = math.max(bbox_max[i],p1[i]);
					bbox_max[i] = math.max(bbox_max[i],p2[i]);
					bbox_max[i] = math.max(bbox_max[i],p3[i]);
					bbox_min[i] = math.min(bbox_min[i],p1[i]);
					bbox_min[i] = math.min(bbox_min[i],p2[i]);
					bbox_min[i] = math.min(bbox_min[i],p3[i]);
				}
				indices[3*k] = 3*k;
				indices[3*k+1] = 3*k+1;
				indices[3*k+2] = 3*k+2;
				vals.push(view.getUint16(pos+48,LE))

				pos += 50;
			}


		    c.points = new Float32Array(points);
		    c.normals = new Float32Array(normals);
		    c.indices = new Int32Array(indices);
		    c.vals = new Uint16Array(vals);


			var minmax = getMinMax(c.vals,c.vals.length,500);
			c.histogram = comphisto(minmax.min,minmax.max,20,c.vals,c.vals.length,500);

			if (Math.abs(minmax.min-minmax.max) < 0.0000000001)
				c.vals = undefined;

		    c.max = bbox_max;
		    c.min = bbox_min;

			if (arrived != undefined)
				arrived();


		}

	}		




   that.prepareConmatData = function(fileObject,processinfo,arrived)
   {
		fileObject.content= JSON.parse(fileObject.content);

		fileObject.content.themat = fileObject.content.cc;

		if (fileObject.content.themat.length > 0)
		{
			var m = fileObject.content.themat[0].length;
			var ac;
			if (m>1)
				ac = fileObject.content.themat.reduce(function(a, b) {
						  return a.concat(b);
						});
			else 
			{
				ac = fileObject.content.themat.slice(0);
				fileObject.content.themat = [ac];
			}



			var n = ac.length;

			var ac_minmax = getMinMax(ac,n,500);
			fileObject.histogram = comphisto(ac_minmax.min,ac_minmax.max,20,ac,n,500);
		}
		else
				alertify.error("Problem while reading connectivty matrix");
		
		processinfo();
		arrived();


   }




  /***************************************************************************************
   *  unpacking/reading of Fiber data
   ****************************************************************************************/

	that.prepareFiberData = function(fileObject,uint8Response,processinfo,arrived)
	{

		if (fileObject.filename.search('.tck') > 0)
		{      	
		   that.importandbuildOcttree(fileObject,uint8Response,processinfo, arrived,"TCK")
		}
		else if (fileObject.filename.search('.trk') > 0)
		{      	
		   that.importandbuildOcttree(fileObject,uint8Response,processinfo, arrived,"TRK")
		}
		/*
		if (fileObject.filename.search('.tck') > 0)
		{      	

		   importTCK(fileObject,uint8Response,processinfo, 
		   function()
		   {
			   if (fileObject.content != undefined)
			   {
				 fileObject.content.md5 = SparkMD5.ArrayBuffer.hash(uint8Response.buffer);
				 that.buildOctree(fileObject.content,processinfo);				 
			   }
			   arrived();
		   });
		}
		else if (fileObject.filename.search('.trk') > 0)
		{      	

		   importTRK(fileObject,uint8Response,processinfo, 
		   function()
		   {
			   if (fileObject.content != undefined)
			   {
				 fileObject.content.md5 = SparkMD5.ArrayBuffer.hash(uint8Response.buffer);
				 that.buildOctree(fileObject.content,processinfo);				 
			   }
			   arrived();
		   });
		}*/
	}


	that.importandbuildOcttree = function(fileObject,uint8Response,processinfo,arrived,typ)
	{
		    var scriptname = 'KTools/KOctreeImportWorker.js' + '?' +  static_info.softwareversion;;
			if (typeof url_pref != "undefined")
			   scriptname = url_pref + scriptname;

			var worker = new Worker(scriptname);
			fileObject.octreeWorker = worker;
	
			worker.queryInProgress = false;
			worker.ready = false;
			worker.postMessage = worker.webkitPostMessage || worker.postMessage;
			worker.addEventListener('message', function(e) {
				e = e.data;
				if (e.msg == 'index_progress')
				{
					processinfo(e.detail);
					if (e.detail == undefined)
						worker.ready = true;
					worker.queryInProgress = false;
				}
				else if (e.msg == 'query_done')			
				{
					worker.queryInProgress = false;
					worker.currentCallback(e.selection);
				}
				else if (e.msg == 'import_done')			
				{
					worker.queryInProgress = false;
					var content = e.tracts;					
                    KObject3DTool.unpackTracts(content);
                    content.octreeWorker = worker;
 				    fileObject.content = content;                    
                    fileObject.content.md5 = e.md5;
					arrived(content)
				}
				else if (e.msg == 'import_failed')			
				{
    				worker.postMessage({message:'kill'},[]);
					arrived()
				}
			}, false);

			worker.postMessage({message:'import',typ:typ,buffer: uint8Response },[uint8Response.buffer]);
	
			worker.kill = function()
			{
				worker.postMessage({message:'kill'},[]);

			}

			worker.queue = [];

			worker.findFibers = function (p,r,d,callback,force)
			{

				if (!worker.queryInProgress | force)
					launch()
			
				function launch()
				{
					worker.postMessage({message:'query', query:p,radius:r,dirsel:d,qid:worker.currentQueryID},		[]);
					worker.currentCallback = callback;
					worker.queryInProgress = true;
				}

			}

	}
    


	that.buildOctree = function(tracking,processinfo)
	{
		if (KObject3DTool.useOctreeWorker)
		{
		    var scriptname = 'KTools/KOctreeWorker.js' + '?' +  static_info.softwareversion;;
			if (typeof url_pref != "undefined")
			   scriptname = url_pref + scriptname;

			var worker = new Worker(scriptname);
			tracking.octreeWorker = worker;
			worker.queryInProgress = false;
			worker.ready = false;
			worker.postMessage = worker.webkitPostMessage || worker.postMessage;
			worker.addEventListener('message', function(e) {
				e = e.data;
				if (e.msg == 'index_progress')
				{
					processinfo(e.detail);
					if (e.detail == undefined)
						worker.ready = true;
					worker.queryInProgress = false;
				}
				else if (e.msg == 'query_done')			
				{
					worker.queryInProgress = false;
					worker.currentCallback(e.selection);
				}
			}, false);

			worker.postMessage({message:'createOctree',
			tracts: KObject3DTool.packTractsForTransfer({content:tracking}) },		[]);
	
			worker.kill = function()
			{
				worker.postMessage({message:'kill'},[]);

			}

			worker.queue = [];

			worker.findFibers = function (p,r,d,callback,force)
			{
			/*	worker.queue.push(launch);

				var toexec = worker.queue[0];
				worker.queue.splice(0,1);
				
				if (!worker.queryInProgress)
					toexec();
*/

				if (!worker.queryInProgress | force)
					launch()
			
				function launch()
				{
					worker.postMessage({message:'query', query:p,radius:r,dirsel:d,qid:worker.currentQueryID},		[]);
					worker.currentCallback = callback;
					worker.queryInProgress = true;
				}

			}

		}
		else
		{
			 var tracts = tracking.tracts;		
			 var octree = tracking.octree;


			 myOctree.fiberstep = math.floor(tracking.tot_points/5000000);
			 if (myOctree.fiberstep < 1) 
				myOctree.fiberstep = 1;


			 tracts.chunk( function(t,j){		 	
				octree.add(t,j);			
			 },512, 1, function(i) {
				processinfo("building octree " + Math.round(100*i/tracts.length) + "%");} ,
				function() {processinfo(undefined)} );
		}

	}



  /***************************************************************************************
   *  SubView creation
   ****************************************************************************************/


    that.createView = function(imageStruct,viewer,intent)
    {
       var fobj = imageStruct;
	   if (imageStruct.contentType == 'tracts')
	   {
	   		var parent_view;
	   		if (intent.jsonsubsets)
	   		{
	   			fobj.content.selections = intent.jsonsubsets.selections;
	   		}
	   		if (intent.select >= 0  || (typeof intent.select == 'string' && intent.select != 'allselections'  && intent.select != 'all'))
			{
				var found = false;				
				for (var k = 0;k < viewer.objects3D.length;k++)					
					if (viewer.objects3D[k].fibers && 
					 viewer.objects3D[k].fibers.fileID == fobj.fileID)
					{
						found = true;
						parent_view = viewer.objects3D[k];
						break;
					}
			    if (!found)
			    {
			       parent_view = that.createFiberView(fobj,viewer,{isParentView:true})
			       parent_view.Selection = undefined;
			       viewer.objects3D.push(parent_view);
			    }
			}
			else
				intent.isParentView = true;

			intent.parent = parent_view;

			var view = that.createFiberView(fobj,viewer,intent);
			if (!intent.isParentView)
			{
				view.parent = parent_view;
				if (parent_view.children == undefined)
					parent_view.children = [];
				parent_view.children.push(view);
			}

			return view
	   }
	   else if (imageStruct.contentType == 'gii')
			return that.createSurfaceView(fobj,viewer,intent);
	   else if (imageStruct.contentType == 'rtstruct')
			return that.createContourView(fobj,viewer,intent);
	   else if (imageStruct.filename.search(".cc.json") != -1)
			return that.createConmatView(fobj,viewer,intent);
	   else
	   {
	   		console.log('contenttype unknown');
	   		return;
	   }       
    }


  /***************************************************************************************
   *  The fiber SubView 
   ****************************************************************************************/


    that.createFiberView = function(fobj,viewer,intent)
        {
            var viewer = viewer;
            var alpha = 1;
			if (state.viewer.fiberAlpha)
				alpha = 0.15;


            var tck = { fibers:fobj,
                        fiberUpdater:undefined,
                        
                        fibcut:-1,
                        fibcut_thres:5,
                        fibcut_proj:-1,
						color: (viewer.objects3D.length)%KColor.list.length,
						alpha:alpha,
						type:"fiber",

						annotation_subsets:{},
						associated_annotation:-1,
                        subsetToDisplay:undefined,
                        fiberSign:undefined,
                        Selection:{},
                        children:[],

                        viewer:viewer,

						uid: KObject3DTool.uidCnter++,
                        isCurrent: false
            };

			tck.getViewProperties = function()
			{
				return {color:this.color,
 						fibcut:this.fibcut,
                        fibcut_thres:this.fibcut_thres,
                        fibcut_proj:this.fibcut_proj,
						alpha:this.alpha
				};
			}
			if (intent.isParentView && intent.dirvolref == undefined)
				tck.Selection = undefined;

			if (intent != undefined)
			{			
				if (intent.dirvolref)
				{
					var scale = intent.dirvolref.nii.voxSize[0];
					var params = that.tracking_panel.params;
					params.Jitter = scale / 40;
					params.Stepwidth = scale / 5;
					that.tracking_panel.update();
					tck.trackingVolHistoman = intent.dirvolref.histoManager;
					tck.trackingVol =  intent.dirvolref.nii
					tck.trackingVolID = intent.dirvolref.currentFileID
				}
				else
				{

					if (intent.select != undefined && intent.select != 'all')
					{
						if (tck.fibers.content.selections != undefined)
						{
							if (typeof intent.select == 'string')
							{							
								 for (var k = 0; k < tck.fibers.content.selections.length;k++)
									if (tck.fibers.content.selections[k].name == intent.select)
									{
										intent.select = k;
										break;
									}
							}

							tck.Selection = tck.fibers.content.selections[intent.select];
							if (tck.Selection != undefined)
								tck.subsetToDisplay = tck.Selection.subset;
						}
					}
				}
				tck.parent = intent.parent;

				if (intent.alpha != undefined) tck.alpha = intent.alpha;
				if (intent.fibcut != undefined) tck.fibcut = intent.fibcut;
				if (intent.fibcut_thres != undefined) tck.fibcut_thres = intent.fibcut_thres;
				if (intent.fibcut_proj != undefined) tck.fibcut_proj = intent.fibcut_proj;
				if (intent.isParentView != undefined) tck.isParentView = intent.isParentView;
			}

			var fiberDirColor_shader = viewer.gl.createFiberShader()
			fiberDirColor_shader.setFloat("planesThres",parseFloat(tck.fibcut_thres));   	
		    fiberDirColor_shader.setFloat("planesNum",tck.fibcut);
			fiberDirColor_shader.setFloat("alpha",tck.alpha);
			fiberDirColor_shader.setFloat("planesProj",tck.fibcut_proj);
			tck.fiberDirColor_shader = fiberDirColor_shader;
			
			tck.selectFibersReset =selectFibersReset;
			function selectFibersReset(str)
			{
			  	  removeAnnotationAssoc();
				  tck.associated_annotation = -1;
				  tck.autogenerate_tracks = false;
				  if (str == 'all' || str == 'accumulate' )
				  {
					 tck.subsetToDisplay = undefined;

					 if (tck.Selection != undefined)
					 {
					 	if (tck.Selection.subset != undefined)
					 	{
							tck.subsetToDisplay = tck.Selection.subset;
							viewer.statusbar.report(tck.subsetToDisplay.length + " fibers shown");
					 	}				
					 }

					 if (tck.trackingVol != undefined)
					 {
					 	tck.autogenerate_tracks = true;
						if (str == 'accumulate')
							tck.autogenerate_tracks = 2;
					 }


				  }
				  else
					 tck.subsetToDisplay = [];
				  tck.updateFibers();
			}


			function computeFiberMorphology(type)
			{

	  			  var vismap =  cloneNifti(viewer.content,"tmpvisit","float");

				  createFiberVisitMap(tck.fibers.content.tracts,tck.subsetToDisplay,-1,
				                      vismap,
				                      viewer.viewport.progressSpinner,
				  function()
				  {
				  	  vismap.content = prepareMedicalImageData(parse(vismap.buffer), vismap, {});
					  if (type == "dilate")
					  {
				      	  tck.subsetToDisplay = undefined;
					 	  selectFibersByROI(tck,vismap,false,0.6,0);
					  }
					  else if (type == "erode")
					  {
					 	  selectFibersByROI(tck,vismap,false,0.8,1.5);					  	
					  }
					  else
					  {
				      	  tck.subsetToDisplay = undefined;
					 	  selectFibersByROI(tck,vismap,false,0.8,1.5);
					  }0.4
					
				  });

			}

			
			////////////// color context menu
       	    var colors = ["dir"];
       	    colors = colors.concat(KColor.list);
			var $colselector = KColorSelector(colors,	
				 function(c) {	if (c=="dir") return ""; else return "background:"+RGB2HTML(c[0],c[1],c[2])+";"; },
				 function (col,colindex)
				 {
				 	if (tck.Selection)
				 		tck.Selection.color = colindex;
				   viewer.gl.activateRenderLoop();
                    fiberDirColor_shader.setFloat("alpha",tck.alpha);	
                    if (col != undefined)
                    {					
						if (col == 'dir')
							fiberDirColor_shader.setVector4("col",new BABYLON.Vector4(0,0,0,0));
						else
							fiberDirColor_shader.setVector4("col",new BABYLON.Vector4(col[0]/255,col[1]/255,col[2]/255,1));
                    }

					if (tck.fiberUpdater && tck.fiberUpdater.nicefibs!= undefined)
						tck.showNiceFibs();

				 },
				 tck);

			if (intent != undefined && intent.color != undefined)
			{
				tck.color = intent.color%colors.length ;
				if (tck.Selection)
					tck.Selection.color = tck.color;
				$colselector.updateColor();
			}



		    /***************************************************************************************
		     *  fiber selection context menu 
		     ****************************************************************************************/
			 
			 tck.fiberSelAction = fiberSelAction;
 			 function fiberSelAction(str)
			  {
				//console.log(tck);
				  if (str == '' | str == undefined)
					return;
				  else if (str == 'all' | str == 'none')
				  {
					selectFibersReset(str)
				  }  
				  else if (str == 'fiberode')
				  {
					computeFiberMorphology("erode");
				  }
				  else if (str == 'fibdilate')
				  {
					computeFiberMorphology("dilate");
				  }
				  else if (str == 'fibclose')
				  {
					computeFiberMorphology(false);
				  }
				  else if (str == 'trackparams')
				  {
				  	that.tracking_panel.toggle();
				  }
				  else if (str.substring(0,4) == 'ROI_' | str.substring(0,9) == 'minusROI_' )
				  {

					  var minus = false;
					  if (str.substring(0,5) == 'minus') { str =  str.substring(5); minus = true; }
					  var roi = KViewer.roiTool.ROIs[str.substring(4)];

					  alertify.prompt("Minimal overlap of streamline with ROI in percent (0 - at least one vertex touches)", function(e,str)	
					  {				
						if (e)
						{						
							var percentage = parseFloat(str)/100;
							selectFibersByROI(tck,roi,minus,percentage)
						}
					  },"0");
				  }
				  else if (str.substring(0,8) == 'seedROI_' )
				  {
					  var roi = KViewer.roiTool.ROIs[str.substring(8)];

					  var ret = tck.fiberTracking({roi:roi});
		
					  tck.fibers.content = ret;
					  tck.subsetToDisplay = undefined;
					  tck.updateFibers();
									  


				  }
				  else if (str.substring(0,5) == 'WMQL_' )
				  {
					setAnnotationAssoc(-1);
					if (!KWMQLPanel.visible)
					{
						 var atlas = KViewer.atlasTool.objs[str.substring(5)];
						 KWMQLPanel.openPanel(tck.fibers,atlas);
					}
				  }
				  else if (str == "selectbymarker" )
				  {
					if (markerProxy.currentSet == undefined)
						KMarkerPanel_points();
					setAnnotationAssoc(markerProxy.currentSet.uuid);
					markerProxy.currentSet.showPanel()
					if (!tck.isCurrent)
					    makeCurrent();
				  }
				  else if (str == "deselectbymarker" )
				  {
				  	selectFibersReset('all')
				  }
				  else if (str == "genmarkersels" )
				  {
				  	
					var keys = Object.keys(markerProxy.markersets);
					tck.viewer.viewport.progressSpinner("processing");					
					iterate(0);
					function iterate(k)
					{
						var mset = markerProxy.markersets[keys[k]];	
						if (mset == undefined)
						{
							setAnnotationAssoc(-1);
							tck.viewer.viewport.progressSpinner();					
							return;
						}
						setAnnotationAssoc(mset.uuid,function()
						{
							cloneFibs(mset.name);
							iterate(k+1);
						});

					}

				  }
				  /*
				  else
					  setAnnotationAssoc(str);					  	  					  	  */
			  }

			 var $fiberpickselector = $("<div  class='KViewPort_tool fibers' >  <i   class='fa fa-comment-o fa-1x'></i></div>");
			 var fibpick_contextmenu = new KContextMenu(
				  function() { {
					 var $menu = $("<ul class='menu_context'>");
					 if (tck.trackingVol == undefined)
					 {
						 $menu.append($("<li  onchoice='fibdilate' > fiber dilation   </li>"));
						 $menu.append($("<li  onchoice='fibclose' > fiber closure   </li>"));
	 					 $menu.append($("<li  onchoice='fiberode' > fiber erosion   </li>"));
					 }
 					 if (tck.trackingVol != undefined)
 					 {
						 $menu.append($("<hr width='100%'> ")); 					 
 				     	 $menu.append($("<li onchoice='trackparams' > tracking parameters   </li>"));
 					 }
 					 var sets = markerProxy.getSets();

					 $menu.append($("<hr width='100%'> ")); 					 
					 var cur = tck.viewer.getCurrentFiberView() || tck;
					 if (cur != undefined)
					 {   

						 if (cur.associated_annotation != -1)
							 $menu.append($("<li onchoice='selectbymarker' > Select by markerset   <i class='fa fa-dot-circle-o'></i>  </li>"));
						 else
							 $menu.append($("<li onchoice='selectbymarker' > Select by markerset   <i class='fa fa-circle-o'></i>    </li>"));
					 }

				      if ( sets.length >0)
 					 {		 
						 $menu.append($("<li onchoice='genmarkersels' > Generate fiber selections from all sets  </li>"));
	 				   

 					 }

 					var ROIs = KViewer.roiTool.ROIs
 					var rois = Object.keys(ROIs);
  					if (rois.length > 0)
 					{
						$menu.append($("<hr width='100%'> ")); 					 
						$menu.append($("<span class='inactive_menu_point'> &nbsp Select by ROI</span>"));
						$menu.append($("<hr width='100%'> ")); 					 
						 for (var k = 0; k < rois.length;k++)
						 {
						 	var add = ""
						 	if (tck.trackingVol != undefined)
						 	{
								add = " <i  onchoice='seedROI_"+rois[k]+"' class='fa button' style='right:30px;'>seed</i> "
						 	}
						 	$menu.append($("<li onchoice='ROI_"+rois[k]+"'  >"+ROIs[rois[k]].filename+" <i  onchoice='minusROI_"+rois[k]+"' class='fa fa-minus button'></i>"+add+" </li>"));
						 }

 					}
					//else
 					//	$menu.append($("<span class='inactive_menu_point emptylist'> &nbsp no ROI present</span>"));


 					var ATLASs = KViewer.atlasTool.objs;
 					var atlass = Object.keys(ATLASs);
 					if (tck.trackingVol == undefined)
 					{
						$menu.append($("<hr width='100%'> ")); 					 
						$menu.append($("<span class='inactive_menu_point'> &nbsp White Matter QL</span>"));
						$menu.append($("<hr width='100%'> ")); 					 
						if (atlass.length > 0)
						{
							 for (var k = 0; k < atlass.length;k++)
							 {
									$menu.append($("<li onchoice='WMQL_"+atlass[k]+"'  >"+ATLASs[atlass[k]].filename+"</li>"));
							 }

						}
						else
							$menu.append($("<span class='inactive_menu_point emptylist'> &nbsp no atlas present</span>"));
 					}
 				
					return $menu; }
				  }, function(str,ev)
				  {
				  	if (tck.children != undefined)
						for (var k = 0; k < tck.children.length;k++)
						{
							if (tck.children[k].isCurrent)
							{
								tck.children[k].fiberSelAction(str)
								return;
							}
						}
				  	fiberSelAction(str);
				  }

				 );
			 $fiberpickselector.click(fibpick_contextmenu);

		    /***************************************************************************************
		     *  fiber cut context menu 
		     ****************************************************************************************/


		      function fiberCutAction(str,ev)
				  {
				  	  if (str == '' | str == undefined)
				  	  	return;
				  	  if (str == '-1' | str == '0' | str == '1' | str == '2' )
				  	  {
				         tck.fibcut = parseInt(str);
				         tck.fiberDirColor_shader.setFloat("planesNum",tck.fibcut);
				         tck.fiberDirColor_shader.setFloat("planesProj",tck.fibcut_proj);
				  	  }
				  	  if (str == 'project')
				  	  {
				  	  	  tck.fibcut_proj = -tck.fibcut_proj;
				          tck.fiberDirColor_shader.setFloat("planesProj",tck.fibcut_proj);
				  	  }
				  	  viewer.gl.activateRenderLoop();
				  }

			 tck.fiberCutAction = fiberCutAction;
			 var $fibercutselector = $("<div  class='KViewPort_tool fibers' >  <i   class='fa fa-cut fa-1x'></i></div>");
			 var fibcut_contextmenu = new KContextMenu(
				  function() { 
					 var $menu = $("<ul class='menu_context'>");
					 var name = ['No cut','Coronal','Transversal','Saggital'];
					 var sel = ['','','','']; sel[tck.fibcut+1] = 'dot-';
					 for (var k = -1;k <3;k++)
 					 	$menu.append($("<li  onchoice='"+k+"' > "+name[k+1]+"  <i  onchoice='"+k+"' class='fa fa-"+sel[k+1]+"circle-o'></i> </li>"));
				      if (tck.fibcut != -1)
				      {

						  var $thres = $("<input onchoice='preventSelection' type='number' min='0.01' step='0.1' max='20'>").val(tck.fibcut_thres).
						  on('change',function(ev){
							var $input = $(ev.target);
							tck.fibcut_thres = $input.val();
							fiberDirColor_shader.setFloat("planesThres",parseFloat(tck.fibcut_thres));   	
							if (tck.children)
								for (var k = 0; k < tck.children.length;k++)
								{
									tck.children[k].fibcut_thres = $input.val();
									tck.children[k].fiberDirColor_shader.setFloat("planesThres",parseFloat(tck.fibcut_thres));   	
								}
							 viewer.gl.activateRenderLoop();
						  });
						  $menu.append($("<li  onchoice='preventSelection'> Width: </li>").append($thres));
				      }
				    $menu.append($("<hr width='100%'> ")); 		
				    var sel = '';
				    if (tck.fibcut_proj>0) sel = '-check';			 				       
 				    $menu.append($("<li onchoice='project'> Projection  <i onchoice='project' class='fa fa"+sel+"-square-o'></i> </li>"));
					return $menu; 
				  },
				  function(str,ev)
				  {
					fiberCutAction(str);
				  	if (tck.children)
						for (var k = 0; k < tck.children.length;k++)
							tck.children[k].fiberCutAction(str);
				  }
				  );
			 $fibercutselector.click(fibcut_contextmenu);








			 var $osamp = $("<input title='Spatial undersampling factor of matrix' style='right:50px;width:40px' onchoice='preventSelection' type='number' min='0.5' step='1' max='20'>")
			 				.val(2);
			 var $osamp2 = $("<input title='Spatial undersampling factor of matrix' style='right:50px;width:40px' onchoice='preventSelection' type='number' min='0.5' step='1' max='20'>")
			 				.val(2);
			 			
			 var $termlen = $("<input title='length of terminal' style='right:50px;width:40px' onchoice='preventSelection' type='number' min='0.5' step='1' max='20'>").val(2);
			 var barscontextmenu = new KContextMenu(
				  function() { 
				     var numfibs = tck.fibers.content.tracts.length ;
					 if (tck.Selection && tck.Selection.subset)			 
					 	numfibs = tck.Selection.subset.length;
				  
					 var $menu = $("<ul class='menu_context'>");
					 if (tck.isParentView && tck.children != undefined && tck.children.length>0)
					 {
					 	$menu.append($("<li onchoice='save' ><i class='leftaligned fa fa-save'></i>  save all</li>"));
					 	$menu.append($("<li onchoice='showall' ><i class='leftaligned fa fa-refresh'></i>  show all selections</li>"));
					 }
					 else
					 	$menu.append($("<li onchoice='save' ><i class='leftaligned fa fa-save'></i>  save selection</li>"));
					 if (tck.subsetToDisplay != undefined && tck.subsetToDisplay.length > 0 && tck.subsetToDisplay.length < numfibs) 
					 	$menu.append($("<li onchoice='crop' > <i class='leftaligned fa fa-plus'></i>crop selection ("+tck.subsetToDisplay.length+"/"+numfibs+")</li>"));
					 if (tck.trackingVol != undefined && tck.fibers.content.tracts.length > 0)
					 	$menu.append($("<li onchoice='crop' > <i class='leftaligned fa fa-plus'></i>crop selection ("+numfibs+")</li>"));
					 
					 if (!tck.isParentView)
					 	$menu.append($("<li onchoice='fix' > <i class='leftaligned fa fa-dot-circle-o'></i>fix selection </li>"));
					 if (!tck.visitworker)
						 $menu.append($("<li onchoice='visitmap' ><i class='leftaligned fa fa-print'></i> render visit map </li>").append($osamp));
					 else
						 $menu.append($("<li onchoice='visitmap' ><i class='leftaligned fa fa-print'></i> show visit map </li>"));


					 if (!tck.visitworker_terms)
     	 			 	$menu.append($("<li onchoice='termmap' ><i class='leftaligned fa fa-print'></i> render terminal map </li>").append($termlen).append($osamp2));
					 else
     	 			 	$menu.append($("<li onchoice='termmap' ><i class='leftaligned fa fa-print'></i> show terminal map </li>"));

					 $menu.append($("<hr width='100%'> ")); 		
					 var nfp= " <i  onchoice='parametersnv' class='fa button' style='right:30px;'>parameters</i> "

					 $menu.append($("<li onchoice='nicefibs' > Display nice fibers "+nfp+" </li>"));
					 $menu.append($("<hr width='100%'> ")); 					 

					 $menu.append($("<span class='inactive_menu_point'> &nbsp #tracts: " +
					 numfibs + "</span>"));
					 $menu.append($("<hr width='100%'> ")); 					 
					



					return $menu; 
				  }, function(str,ev)
				  {
				  	  if (str == '' | str == undefined)
				  	  	return;
				  	  if (str == 'save')
				  	  {
				  	  	 if (tck.fibers.content.md5 != undefined)
				  	  	     that.save(tck.fibers,tck.Selection);
				  	  	 else
				  	  	 {
				  	  	     that.saveTCK(tck)
				  	  	 }
				  	  }
				  	  else if (str == 'showall')
				  	  {
				  	  	selectFibersReset('none');
						 for (var k = 0 ; k < tck.children.length; k++)
				  	  		 tck.children[k].selectFibersReset('all');
				  	  	
				  	  }
				  	  else if (str == 'crop')
				  	  {
				  	  	cloneFibs();
				  	  }
				  	  else if (str == 'fix')
				  	  {
				  	  	if (tck.Selection == undefined)
				  	  		tck.Selection = {subset: tck.subsetToDisplay, name:""};
				  	  	else
				  	  		tck.Selection.subset = 	tck.subsetToDisplay;
				  	  }
				  	  else if (str == 'visitmap')
				  	  {
				  	  	if (tck.visitworker != undefined)
				  	  		tck.visitworker.showInViewer(tck.viewer);
				  	  	else
				  	  		tck.visitworker = createVisitMap(parseFloat($osamp.val()),undefined,true);
				  	  }
				  	  else if (str == 'termmap')
				  	  {
				  	  	if (tck.visitworker_terms != undefined)
				  	  		tck.visitworker_terms.showInViewer(tck.viewer);
				  	  	else 
//				  	  	    tck.visitworker_terms = createVisitMap(parseFloat($osamp.val()),undefined,true);
				  	  
				  	  	    tck.visitworker_terms = createVisitMap(parseFloat($osamp2.val()),parseFloat($termlen.val()),true);
				  	  }
					  else if (str == 'nicefibs')
				  	  {
				  	  	tck.showNiceFibs();
				  	  }
					  else if (str == 'parametersnv')
				  	  {
				  	  	tck.nicefibers_panel.show();
				  	  }
				  },undefined);



			tck.nicefibers_panel = KNiceFibPanel()

		    /***************************************************************************************
		     *  the viewer toolbar
		     ****************************************************************************************/
			var $captiondiv,$currentpickerdiv,$dragdiv,$savediv,$showhidediv,$bardiv;
            tck.divs = [ 	$("<br style='clear:both' />"),
                          $("<div  class='KViewPort_tool persistent fibers'>  <i class='fa fa-close fa-1x'></i></div>")
                              .click( close  ).appendTooltip("closefiberview").mousedown(viewer.viewport.closeContextMenu(tck)),
                          $savediv=$("<div  class='KViewPort_tool fibers'>  <i class='fa fa-save fa-1x'></i></div>")
                              .appendTooltip("savefibers").click(function(t,s) { return function() { 
                              that.save(t,s) } }(tck.fibers,tck.Selection)).hide(),
						  $bardiv = $("<div  class='KViewPort_tool fibers'>  <i class='fa fa-bars fa-1x'></i></div>")
						  .click(barscontextmenu),
                          $("<div  class='KViewPort_tool fibers'>  <i class='fa fa-print fa-1x'></i></div>")
                              .appendTooltip("createvisitmap").click(createVisitMap).hide(),
                          $("<div  class='KViewPort_tool fibers'>  <i class='fa fa-plus fa-1x'></i></div>")
                              .appendTooltip("cropfibers").click(cloneFibs).hide(),
                          $showhidediv = $("<div  class='KViewPort_tool fibers'>  <i class='fa fa-refresh fa-1x'></i></div>")
                              .appendTooltip("showallfibers").click(function(e) {

                              	if (tck.Selection == undefined || tck.Selection.subset == undefined)
                              	{
									if (tck.subsetToDisplay == undefined)
										selectFibersReset('none')
									else
										selectFibersReset('all')
                              	}
                              	else
                              	{
									if (tck.Selection.subset.length == tck.subsetToDisplay.length)
										selectFibersReset('none')
									else
										selectFibersReset('all')                              		
                              	}

                              	}).mousedown(function(e) {

                              		if (e.buttons == 2)
                              			selectFibersReset('accumulate')

                              	}),

                          $currentpickerdiv = $("<div  class='KViewPort_tool fibers'>  <i class='fa fa-pencil-square-o fa-1x'></i></div>")
                              .appendTooltip("currentpicker").click( makeCurrent  ),
                          $fibercutselector.appendTooltip("fibercut"),
                          
                          $fiberpickselector.appendTooltip("fiberpick"),
                          $captiondiv = $("<div lang='klingon' spellcheck='false'  class='KViewPort_tool fibers caption'> "+tck.fibers.filename+"</div>"),
                          $colselector.appendTooltip("selectcolor"),

                          $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-fw fa-hand-paper-o fa-1x'></i></div>")
                          	.appendTooltip("dragdropviewport")
                          
                       ];
			//if (tck.Selection == undefined)
			//	$savediv.addClass("inactive")

			if (!tck.isParentView)
			{
				$fibercutselector.hide();
				$fiberpickselector.hide();
			}

			if (tck.parent != undefined)
				viewer.toolbar.appendAfter(tck.divs,tck.parent);
			else
				viewer.toolbar.append(tck.divs,'fiber');


			tck.$currentpickerdiv = $currentpickerdiv;
			tck.$currentpickerdiv.hide();
			tck.$captiondiv = $captiondiv;

 

			$captiondiv.on('click',function(){
				makeCurrent();
			});
			$captiondiv.on('mouseenter',function(){
				fiberDirColor_shader.setFloat("hover",0.5);			
				viewer.gl.activateRenderLoop();
			});
			$captiondiv.on('mouseleave',function(){
				fiberDirColor_shader.setFloat("hover",0);				
				viewer.gl.activateRenderLoop();	
			});
            $dragdiv.attr("draggable",'true');
            $dragdiv.on("dragstart", dragstarter({ type:'file', mime: 'tck',  filename: tck.fibers.filename,  fileID: tck.fibers.fileID,close:close }));
			viewer.toolbar.attachhandhover($dragdiv);
			if (tck.Selection  != undefined)
			{
				if (tck.Selection.namedivs == undefined)
					tck.Selection.namedivs = {};

				$captiondiv.text(tck.Selection.name);


			    tck.Selection.namedivs[tck.uuid] = ($captiondiv);

				KSetContentEditable($captiondiv, function() {

					var sel = tck.Selection;
					
					sel.name = $captiondiv.text();
					if (sel.namedivs != undefined)
			   		{
			   			for (var i in sel.namedivs)
			   			{
			   				if ($captiondiv != sel.namedivs[i] && sel.namedivs[i].text != undefined)
			   					sel.namedivs[i].text(sel.name);
			   			}
			   		}				
			   		that.update();	

				});

/*
				$captiondiv.attr("contenteditable",true);

                $captiondiv.keydown(function(ev) { if (ev.keyCode == 13) { $(ev.target).blur(); return false } })
 			    
			    $captiondiv.keyup(function(ev)
				{
					var sel = tck.Selection;
					
					sel.name = $captiondiv.text();
					if (sel.namedivs != undefined)
			   		{
			   			for (var i = 0; i < sel.namedivs.length;i++)
			   			{
			   				if ($captiondiv != sel.namedivs[i])
			   					sel.namedivs[i].text(sel.name);
			   			}
			   		}				
			   		that.update();	
				}	);		   
*/


			}

		
			tck.setVisibilityMarkup = function(vis)
			{
				for (var k = 0; k < tck.divs.length;k++)
				if (vis)
					tck.divs[k].removeClass("tckNotVisible");
				else	
				{
					var b = $(tck.divs[k].children()[0]);
					if (!b.hasClass('fa-comment-o') && !b.hasClass('fa-cut'))
						tck.divs[k].addClass("tckNotVisible");
				}
			}

		   /***************************************************************************************
		    *  fiber renderer
		    ****************************************************************************************/

		    tck.updateFibers = function()
			{
				if (this.fibers == undefined)
					tck.close();

				var subset = tck.subsetToDisplay;
				var content = this.fibers.content; 
				var tracts = content.tracts;
				if (tracts != undefined && tracts.length == 0 && !tck.autogenerate_tracks)
					return;

				if (subset!=undefined && subset.length == 0)
					tck.setVisibilityMarkup(false)
				else
				    tck.setVisibilityMarkup(true)

				if (tck.visitworker)
				{
					tck.visitworker.updateVisit();
				}
				if (tck.visitworker_terms)
				{
					tck.visitworker_terms.updateVisit();
				}

				if (tck.fiberUpdater != undefined)
				{
					tck.fiberUpdater.clear();
				}

				tck.fiberUpdater = {chunksize:64, current_chunk:0, objs:[]};
				var fiberUpdater = tck.fiberUpdater;
				fiberUpdater.num_chunks = 200;

				var seeding;
				if (subset == undefined)
				{
					if (tck.autogenerate_tracks)
					{
						subset = 'autogenerate_tracks';
						if (tck.autogenerate_tracks != 2)				
							content.tracts = undefined;
						if (that.tracking_panel.params.climcon==0)
						{
							seeding = { vol:tck.trackingVol,
										threshold:tck.trackingVolHistoman.clim[1],
										threshold_term:tck.trackingVolHistoman.clim[0],
										numfibs:that.tracking_panel.params.Density*5};
							tck.seedID = tck.trackingVolID ;
						}
						else
						{
							seeding = { vol:tck.viewer.nii,
										threshold:tck.viewer.histoManager.clim[1],
										threshold_term:tck.viewer.histoManager.clim[0],
										numfibs:that.tracking_panel.params.Density*5};

							tck.seedID = tck.viewer.currentFileID;
						}
					    fiberUpdater.num_chunks = that.tracking_panel.params.numChunks;
						if (tck.osid_climchange != undefined)
							 signalhandler.detach("overlay_climChange",tck.osid_climchange);
						if (tck.sid_climchange != undefined)
							 signalhandler.detach("climChange",tck.sid_climchange);


						tck.sid_climchange = signalhandler.attach("climChange", function(ev)
						{
							if (tck.seedID == ev.id && tck.subsetToDisplay == undefined) //tck.subsetToDisplay.length >0)
							    selectFibersReset('all');	

						});


						tck.osid_climchange = signalhandler.attach("overlay_climChange", function(ev)
						{
							if (tck.seedID == ev.id && tck.subsetToDisplay == undefined) //tck.subsetToDisplay.length >0)
							    selectFibersReset('all');	

						});

					}
					else if (fiberUpdater.num_chunks*fiberUpdater.chunksize > tracts.length)
						subset = 'full';

				}
				else
					fiberUpdater.num_chunks = subset.length/fiberUpdater.chunksize;

				function mergefibs(a,b)
				{
					if (a.tracts == undefined)
					{
						a.tracts = b.tracts;
						a.tracts_len = b.tracts_len;						
						a.tracts_min = b.tracts_min;						
						a.tracts_max = b.tracts_max;
						a.tot_points = b.tot_points;
						a.max = [];
						a.min = [];
						for (var t = 0; t < 3; t++)
						{
							a.max[t] = b.max[t];
							a.min[t] = b.min[t];
						}
					}
					else
					{
						a.tracts = a.tracts.concat(b.tracts);
						a.tracts_len = a.tracts_len.concat(b.tracts_len);						
						a.tracts_min = a.tracts_min.concat(b.tracts_min);						
						a.tracts_max = a.tracts_max.concat(b.tracts_max);
						a.tot_points = a.tot_points +b.tot_points;
						for (var t = 0; t < 3; t++)
						{
							a.max[t] = Math.max(a.max[t],b.max[t]);
							a.min[t] = Math.min(a.min[t],b.min[t]);
						}
					}
				}


				function createSubset(subset,tracts,done)
				{
						if (viewer.gl == undefined)
						{
							tck.fiberUpdater.clear();
							done();
							return;
						}
						

						var chunk = []; 	
						if (subset == undefined)
						{	                 
							for (var k = 0; k < fiberUpdater.chunksize;k++)
								chunk.push(k+fiberUpdater.current_chunk*fiberUpdater.chunksize);
//								chunk.push(Math.round(Math.random()*(tracts.length-1)-0.5)+1);
						}
						else if (subset == 'autogenerate_tracks')
						{
						
						if (1) // fibtrackworker switch
						{
							if (tck.fibtrackWorker == undefined)
							    tck.fibtrackWorker = createFibTrackWorker(tck.trackingVol);
	
							if (tck.fibtrackWorker.istracking)
								return;
							tck.fibtrackWorker.track(seeding,params,
							function(ret)
							{
									if (ret.tracts.length > 0)
									{

										var already_tracked = 0;
										if (content.tracts != undefined)
											already_tracked = content.tracts.length;

										for (var k = 0; k < ret.tracts.length;k++)
											chunk.push(k+already_tracked);							

										mergefibs(content,ret);		
										tck.viewer.viewport.progressSpinner(content.tracts_len.length + " fibers tracked");

										tracts = content.tracts;
									}
									if (chunk.length>0)
									{
										fiberUpdater.objs.push(viewer.gl.createFiberBundle(tracts,chunk,'wholebrain',colors[tck.color],fiberDirColor_shader,content));
										done(true)
										return true;
									}
									else 
									{
										done(false)
										return false;
									}

								
							});
							return;
						}
						else
						{

							var ret = realtimeTracking(seeding,tck.trackingVol,that.tracking_panel.params);
							if (ret.tracts.length > 0)
							{

								var already_tracked = 0;
								if (content.tracts != undefined)
									already_tracked = content.tracts.length;
									
								for (var k = 0; k < ret.tracts.length;k++)
									chunk.push(k+already_tracked);							

								mergefibs(content,ret);		
						    	tck.viewer.viewport.progressSpinner(content.tracts_len.length + " fibers tracked");
							
								tracts = content.tracts;

								if (chunk.length>0)
								{
									fiberUpdater.objs.push(viewer.gl.createFiberBundle(tracts,chunk,'wholebrain',colors[tck.color],fiberDirColor_shader));
									done(true)
									return true;
								}
								else 
								{
									done(false)
									return false;
								}

																			
							}
							else
							{
								done(false)
								return false;
							}
						}
							
						}
						else if (subset == 'full')
						{
							for (var k = 0; k < fiberUpdater.chunksize  & k+fiberUpdater.chunksize*fiberUpdater.current_chunk < tracts.length;k++)
								chunk.push(k+fiberUpdater.chunksize*fiberUpdater.current_chunk);							
						}
						else if (subset.length > 0)
						{
							for (var k = 0; k < fiberUpdater.chunksize & k+fiberUpdater.chunksize*fiberUpdater.current_chunk < subset.length;k++)
								chunk.push(subset[k+fiberUpdater.chunksize*fiberUpdater.current_chunk]);					
						}

						if (chunk.length>0)
						{
							fiberUpdater.objs.push(viewer.gl.createFiberBundle(tracts,chunk,'wholebrain',colors[tck.color],fiberDirColor_shader,content));
							done(true)
							return true;
						}
						else 
						{
							done(false)
							return false;
						}



				}

				fiberUpdater.clear = function(dontdisposenicefibers) {
						 if (tck.fibtrackWorker && tck.fibtrackWorker.istracking)
						 {
						 	tck.fibtrackWorker.callback = function() {}
						 }

						 if (fiberUpdater.id != -1) 
						 {
							clearInterval(fiberUpdater.id); 
							fiberUpdater.id=-1;  
						 } 
						 for (var k = 0; k < fiberUpdater.objs.length;k++)
							fiberUpdater.objs[k].dispose();

						 if (fiberUpdater.nicefibs && !dontdisposenicefibers)
						 {
						 	fiberUpdater.nicefibs.dispose();
						 	fiberUpdater.nicefibs = undefined

							var curList = tck.nicefibers_panel.currentlyNice;

							for (var k = 0; k < curList.length;k++)
								if (curList[k] == tck)
								{
									curList.splice(k,1);
									break
								}


						 }

				};



				var builder = function(subset,tracts) { return function() {
							if (fiberUpdater.id == -1)
								console.log("very strange!!!");
							createSubset(subset,tracts,function(ret){				
								fiberUpdater.current_chunk++;

								if (fiberUpdater.current_chunk >= fiberUpdater.num_chunks || !ret)
								{
									clearInterval(fiberUpdater.id); 
									fiberUpdater.id=-1;
									tck.viewer.viewport.progressSpinner();

								}
							});
				} }(subset,tracts) ;

				viewer.gl.activateRenderLoop();
				fiberUpdater.id = setInterval(builder, 50);

				//builder();

			}
		    tck.update = tck.updateFibers;

     		
			tck.showNiceFibs = function()
			{


				var params = tck.nicefibers_panel.params;

				var curList = tck.nicefibers_panel.currentlyNice;

				var found = false;
				for (var k = 0; k < curList.length;k++)
					if (curList[k] == tck)
					{
						found = true;
						break
					}

				if (!found)
					curList.push(tck);


				if (tck.fiberUpdater.nicefibs != undefined)
					tck.fiberUpdater.nicefibs.dispose();


				var plens = tck.fiberUpdater.objs[0].plens;
				var scene = tck.viewer.gl.scene
				var grandParent = tck.viewer.gl.grandParent
				var papa = BABYLON.Mesh.CreateSphere("sphere1", {segments:1,diameter:0}, scene);
				papa.visibility = 1;
				papa.parent = grandParent;


				var mat = tck.viewer.gl.world2GL_matrix()._data;
				var objs = tck.fiberUpdater.objs
				var col = tck.color-1;
				if (col <0 ) col = 0;
				var color = new KColor(KColor.list[col]).darken(0.3).getBabylon();
				var material = new BABYLON.StandardMaterial("texture1", scene);
				material.diffuseColor  = color;
				material.specularPower = params.SpecularPower;
				material.specularColor =  new KColor(KColor.list[col]).darken(1.2).getBabylon();
				var tubopt = { radius: params.Radius, tessellation:params.Tessellation , cap:BABYLON.Mesh.CAP_ALL}
				var thres_ang = Math.pow(Math.abs(1-params.Simplification/100),0.2);

				for (var i = 0; i < objs.length;i++)
				{
//					var pts = objs[i].positions;
//			     	var plens_ = objs[i].plens;

                    var plens = [];
                    var idx = objs[i].getIndices();
                    var c = 1;
                    var k = 0;
                    for (;;)
                    {
                    	if (idx[k+1] != idx[k+2])
                    	{
                            plens.push(c+1);
                            c=0;
                            //k+=3;
                    	}
                    	k+=2;
                    	c++;
                    	if (k >= idx.length)
                    	    break;

                    }

                    var pts = objs[i].getVertexBuffer("position")._buffer._data;


					var offs = 0;
					var flip = tck.viewer.gl.flip;
					for (var k = 0; k <plens.length;k++)
					{
						var p = [];
						var d;
						var d_old = [1,0,0];
						for (var j = 0; j< plens[k];j++)		
						{
							d = [pts[3*j+offs]-pts[3*j+offs-3],(pts[3*j+offs+1]-pts[3*j+offs-2]),(pts[3*j+offs+2]-pts[3*j+offs-1])]
							var dot = d[0]*d_old[0]+d[1]*d_old[1]+d[2]*d_old[2];
							if (j<2 | j==plens[k]-1 | dot*dot / ((d[0]*d[0]+d[1]*d[1]+d[2]*d[2])*(d_old[0]*d_old[0]+d_old[1]*d_old[1]+d_old[2]*d_old[2])) < thres_ang)
							{
								p.push((new BABYLON.Vector3(
										mat[0][0]*pts[3*j+offs]+mat[0][1]*pts[3*j+offs+1]+mat[0][2]*pts[3*j+offs+2]+mat[0][3],
										mat[1][0]*pts[3*j+offs]+mat[1][1]*pts[3*j+offs+1]+mat[1][2]*pts[3*j+offs+2]+mat[1][3],
										mat[2][0]*pts[3*j+offs]+mat[2][1]*pts[3*j+offs+1]+mat[2][2]*pts[3*j+offs+2]+mat[2][3]
										)));
								d_old = d;
							}
						}
						offs += plens[k]*3;
						tubopt.path = p;
						var tube = BABYLON.MeshBuilder.CreateTube("tube", tubopt, scene);
						tube.material = material;
						tube.color = col;
						tube.parent = papa;
					}

				}
				viewer.gl.activateRenderLoop();				
				tck.fiberUpdater.nicefibs = papa;
				tck.fiberUpdater.clear(true);

				
			}

		   /***************************************************************************************
		    *  subset selection by click
		    ****************************************************************************************/

     		tck.modifyByPick = function(p,type,directionsel)
		    {

				function showFibs(selectionresult)
				{	
				    var old = tck.subsetToDisplay
					if (type == 'delete')	
					{						
					    	
						if (tck.subsetToDisplay != undefined)
						{
							tck.subsetToDisplay = kdiff(tck.subsetToDisplay,selectionresult);
						}
						else
						{
							tck.subsetToDisplay = kdiff({all:tck.fibers.content.tracts.length},selectionresult);
						}                    

					}
					else if (type == 'append')	
					{							
						if (tck.subsetToDisplay != undefined)
							tck.subsetToDisplay = kunion(tck.subsetToDisplay,selectionresult).sort();
						else
						{
							tck.subsetToDisplay = selectionresult;
						}
					}
					else if (type == 'subselect')	
					{							
						if (tck.subsetToDisplay != undefined)
							tck.subsetToDisplay = kintersect(tck.subsetToDisplay,selectionresult);
						else
						{
							tck.subsetToDisplay = selectionresult;
						}
					}
					else
						tck.subsetToDisplay = selectionresult;

					if (tck.Selection != undefined && tck.Selection.subset != undefined)
				 		 tck.subsetToDisplay = kintersect(tck.subsetToDisplay,tck.Selection.subset);

					if (old == undefined || Math.abs(old.length - tck.subsetToDisplay.length) > 0)
					{
						that.fiberHistory.add(tck,tck.subsetToDisplay)   
					}	
					viewer.statusbar.report(tck.subsetToDisplay.length + " fibers shown");								 		 
					tck.updateFibers();
	
					
				}


				tck.autogenerate_tracks = false;
				if (tck.trackingVol )
				{
					if (type == 'select')
					{
						var ret = tck.fiberTracking({seed:p,radius:viewer.gl.selectionRadius/2,threshold:tck.trackingVolHistoman.clim[1]});

						tck.fibers.content = ret;
						tck.subsetToDisplay = undefined;
					}
					else if (type == 'delete')
					{

						var octreeWorker = tck.fibers.content.octreeWorker;
						octreeWorker.findFibers(p,viewer.gl.selectionRadius/2,directionsel,showFibs);

					}
					else if (type == 'subselect')
					{

						var octreeWorker = tck.fibers.content.octreeWorker;
						octreeWorker.findFibers(p,viewer.gl.selectionRadius/2,directionsel,showFibs);

					}
					else if (type == 'append')
					{
                        tck.fibers.content.octreeWorker.kill();

						var ret = tck.fiberTracking({seed:p,radius:viewer.gl.selectionRadius/2,threshold:tck.trackingVolHistoman.clim[1]},true);
                        tck.fibers.content = concatfibs(ret,tck.fibers.content,tck.subsetToDisplay)                        
						tck.fibers.content.cid = setTimeout(function(){
							that.buildOctree(tck.fibers.content,that.progressSpinner);	
							tck.fibers.content.cid = undefined;			 
						},10);


						tck.subsetToDisplay = undefined;
					}
 					tck.updateFibers();
				}
				else
				{
		    
					setAnnotationAssoc(-1);

					if (KObject3DTool.useOctreeWorker)
					{
						var octreeWorker = tck.fibers.content.octreeWorker;
						octreeWorker.findFibers(p,viewer.gl.selectionRadius/2,directionsel,showFibs);
					}
					else				
					{    	
						var selectionresult = tck.fibers.content.octree.findFibers(p,viewer.gl.selectionRadius/2,directionsel)
						showFibs(selectionresult);
					}
				}

		     }

            function concatfibs(a,b,idx)
            {
                var tot_points = a.tot_points;
                var len = b.tracts.length;
                if (idx != undefined)
                    len = idx.length;

                for (var j = 0; j < len;j++)
                {
                	var k = j;
                	if (idx != undefined)
                	    k = idx[j]
                	a.tracts.push(b.tracts[k])
                	a.tracts_len.push(b.tracts_len[k])
                	a.tot_points += b.tracts[k].length
                	a.tracts_max.push(b.tracts_max[3*k],b.tracts_max[3*k+1],b.tracts_max[3*k+2])
                	a.tracts_min.push(b.tracts_min[3*k],b.tracts_min[3*k+1],b.tracts_min[3*k+2])
                	for (var i = 0;i < 3;i++)
                	{
                        a.max[i] = math.max(a.max[i],b.tracts_max[3*k+i])
                        a.min[i] = math.min(a.min[i],b.tracts_min[3*k+i])
                	}
                }
                return a;


            }

 	        /***************************************************************************************
		     * clone subset and create new view
 		     ****************************************************************************************/

			 function cloneFibs(name)
			 { 
				var parent;
	
			   	if (tck.isParentView)
			   		parent = tck;
			    else
			    	parent = tck.parent;

			    var fv = that.cloneFibersFromSelection(tck,viewer,parent,name) ;
			  
				fv.fibcut = tck.fibcut;
 				fv.fiberDirColor_shader.setFloat("planesNum",fv.fibcut);	
 							
  			    fv.fibcut_proj = tck.fibcut_proj;
			    fv.fiberDirColor_shader.setFloat("planesProj",fv.fibcut_proj);

//				  	  	  tck.fibcut_proj =

			    if (fv.parent.children == undefined)
			    	fv.parent.children = [];
			    fv.parent.children.push(fv);
			    	

			    viewer.objects3D.push(fv);

			    tck.subsetToDisplay = [];
			    tck.updateFibers();
			 } 

			
	        /***************************************************************************************
		     * manage selection assoc with annotations
		     ****************************************************************************************/


			function getAnnotationByID(id)
			{
				return markerProxy.markersets[id];
								
			}
			tck.getAnnotationByID = getAnnotationByID;




			 function setAnnotationAssoc(annotid,callback)
			 {
			/*	if (annotid == tck.associated_annotation && annotid != -1)
				{
					var annot = getAnnotationByID(tck.associated_annotation);
					if (annot != undefined && annot.onupdate && annot.onupdate[tck.uid])					
						annot.onupdate[tck.uid]();
					else
						removeAnnotationAssoc();		
					return;
				}*/
		

				removeAnnotationAssoc();

				
				if (annotid == -1)
				{
				 	tck.associated_annotation = -1;
					return;
				}


				if (typeof annotid == 'string')				
					tck.associated_annotation = markerProxy.markersets[annotid ].uuid;
				else
				{
					tck.associated_annotation = markerProxy.getSets()[annotid].uuid;
				}
						
				var annot = getAnnotationByID(tck.associated_annotation);
				if (annot == undefined)
					return;

			   // $showhidediv.addClass("current");

		
				annot.onupdate[tck.uid] = function()
				{

					var fobj_cur;
					var points = annot.getPoints();
					var active = annot.getActive();
					if (active != undefined)
					{
						var id = "DBS_"+annot.name+"_"+active.pts.p.name+"_current";
						fobj_cur = KViewer.dataManager.getFile(id);
					}


					 for (var j = 0; j < points.length; j++)
					 {
						var point = points[j];
						if (point.removeupdater[tck.uid])
							delete point.removeupdater[tck.uid];
						if (point.onupdate[tck.uid])
							delete point.onupdate[tck.uid];
					 }						
					


					if (fobj_cur != undefined) // && annot.type == 'electrode') 
					{

						selectFibersByCurrent(tck,fobj_cur,annot.threshold)
						return fobj_cur;
					
					}
					else if (annot.type == 'freeline')
					{

						for (var j = 0; j < points.length; j++)
						{
							var point = points[j];
							point.onupdate[tck.uid] = 

							function(point) { return function(ondone)						
							{									
									selectFibersByTemplate(tck,annot);
									if (ondone && typeof ondone == 'function')
										ondone();
							} 

							}(point) 


							point.removeupdater[tck.uid] =  function(point) { return function()
							{
								delete tck.annotation_subsets[point.uuid];
							} }(point) 
						}
						
						if (points.length>0) // to force update after point cunt change
							points[0].onupdate[tck.uid](); 

					}
					else
					{


						for (var j = 0; j < points.length; j++)
						{
							var point = points[j];
							point.onupdate[tck.uid] = 

							function(point) { return function(ondone)						
							{
									var coords = point.coords;
									if (coords == undefined)
										coords = point.p.coords;

									if (tck.trackingVol)
									{
	                        			tck.autogenerate_tracks = false;
    										
										var ret = tck.fiberTracking({seed:{_data:coords},radius:point.size,threshold:tck.trackingVolHistoman.clim[1]});

										tck.fibers.content = ret;
										tck.subsetToDisplay = undefined;
										tck.updateFibers();
									}
									else if (KObject3DTool.useOctreeWorker)								
									{

										var callback2 = function(res)
										{
											res.reference = point; 
											tck.annotation_subsets[point.uuid] = res;
											aggregateSelectionAndShow(point.parentmarkerset.markerpoints);	
											if (typeof ondone == 'function')
												ondone();								
										} 
										var octreeWorker = tck.fibers.content.octreeWorker;
										octreeWorker.findFibers(coords,point.size,undefined,callback2);
									}
									else
									{
										var octree = tck.fibers.content.octree;
										tck.annotation_subsets[point.uuid] = octree.findFibers(coords,point.size);
										aggregateSelectionAndShow(point.parentmarkerset.markerpoints);
									}
							} 

							}(point) 


							point.removeupdater[tck.uid] =  function(point) { return function()
							{
								delete tck.annotation_subsets[point.uuid];
							} }(point) 
						}
						initialSelection(points);
					}
				
				}
				
				if (annot.onupdate[tck.uid]() == undefined)
				{
					var points = annot.getPoints();		
					if (tck.trackingVol)
					{
						
					}
					else if (KObject3DTool.useOctreeWorker)								
					{
						var trySelect = function()
						{
							var octreeWorker = tck.fibers.content.octreeWorker;
							if (octreeWorker.ready)
								initialSelection(points);
							else
								setTimeout(trySelect,250);
						}

						trySelect();
					}
					else
						initialSelection(points)


				}

				function initialSelection(points)
				{
					iterateSync(0,points.length,
						function(j,ondone) { 
						points[j].onupdate[tck.uid](ondone);  });		
				}
				function iterateSync(current,end,fun)
				{
					if (current < end)
						fun(current,function() {iterateSync(current+1,end,fun) });
				    else
				    {
				    	tck;
				    	if (callback)
				    		callback(tck);
				    }
				}


			 }

			 tck.setAnnotationAssoc = setAnnotationAssoc;

  			 function aggregateSelectionAndShow(points)
			 {
			 	var ps = []; 			 	
				var ps_tmp 
				if (points != undefined)
					ps_tmp = Object.keys(points);
				else
					ps_tmp = Object.keys(tck.annotation_subsets);				
				for (var k = 0; k < ps_tmp.length;k++)
					if (tck.annotation_subsets[ps_tmp[k]] != undefined && tck.annotation_subsets[ps_tmp[k]].reference.active)
						ps.push(ps_tmp[k]);

				if (ps.length > 0)
					tck.subsetToDisplay = tck.annotation_subsets[ps[0]];
				else
					tck.subsetToDisplay = [];

                if (tck.Selection != undefined)
					tck.subsetToDisplay = kintersect(tck.subsetToDisplay,tck.Selection.subset);
				for (var k = 1; k < ps.length; k++)
					tck.subsetToDisplay = kintersect(tck.subsetToDisplay,tck.annotation_subsets[ps[k]]);
				if (tck.subsetToDisplay )
					viewer.statusbar.report(tck.subsetToDisplay.length + " fibers shown");
					
				tck.updateFibers();			
				viewer;			
			 } 
			 tck.aggregateSelectionAndShow =aggregateSelectionAndShow;



             function removeAnnotationAssoc()
             {
             	  $showhidediv.removeClass("current");
				  if (tck.associated_annotation != -1)
				  {
				     var annot = getAnnotationByID(tck.associated_annotation);
					 if (annot != undefined)
					 {
						 delete annot.onupdate[tck.uid];
						 var points = annot.getPoints();
						 


						 for (var j = 0; j < points.length; j++)
						 {
							var point = points[j];
							if (point.removeupdater[tck.uid])
								delete point.removeupdater[tck.uid];
						    if (point.onupdate[tck.uid])
								delete point.onupdate[tck.uid];
						 }
					 }
					 tck.annotation_subsets = {};
				  }
             }
             tck.removeAnnotationAssoc = removeAnnotationAssoc;



			 tck.fiberTracking = function (seeding,nooctree)
			 {

					if (tck.fibers.content!= undefined)
					{
						if (tck.fibers.content.octreeWorker != undefined)
					 		tck.fibers.content.octreeWorker.kill();
					 	else if (tck.fibers.content.cid != undefined)
					 	{
					 		clearTimeout(tck.fibers.content.cid);
					 	}
					}
					var ret =  realtimeTracking(seeding,tck.trackingVol,that.tracking_panel.params);
					
					if (nooctree == undefined || nooctree == false)
					{
						ret.cid = setTimeout(function(){
							that.buildOctree(ret,that.progressSpinner);	
							ret.cid = undefined;			 
						},10);
					}

					viewer.statusbar.report(ret.tracts.length + " fibers tracked");

					return ret;

			 }









			function createVisitMap(undersamp,terminal,persistent,dontshow)
			{
				

 				  var fileObject;
				  var id = "FVS_0";
				  var cnt = 1;
				  while (KViewer.dataManager.getFile(id)!=undefined)
					  id = "FVS_" + cnt++;

				  var fname_prefix = "fvisit_";
				  var endpoints = -1;
				  if (terminal != undefined)
				  {
					  endpoints = terminal;
					  fname_prefix = "fterms_";
				  }

				  var fname = fname_prefix + tck.fibers.filename.replace('.tck','').replace('.json','');
				  if (tck.Selection)
					fname = fname_prefix + tck.Selection.name;
				  fileObject =  cloneNifti(viewer.content,fname,"float",1,undersamp);
				  fileObject.fileID = id;
				  fileObject.modified = true;
				  fileObject.refvisit_tck = tck;
				  fileObject.refvisit_params = {undersamp:undersamp,terminal:terminal};

				  KViewer.dataManager.setFile(fileObject.fileID,fileObject);
				  KViewer.cacheManager.update();
                  
				
				  var worker = {fobj:fileObject,
				  				updateVisit:updateVisit,
				  				showInViewer: function(viewer){
				  				  var fobj = this.fobj;

                                  if (dontshow)
                                      return;
                                   
				  				  if (viewer.nii && viewer.nii.dummy)
									  viewer.setContent(this.fobj,{intent:{}});
								  else
								  {
										KViewer.iterateMedViewers(function(v)
										{
											if (v.currentFileID == viewer.currentFileID)
												v.setContent(fobj,{intent:{overlay:true}});                                       
										});                      
								  }
				  				},

				  kill:function(){
						this.worker.postMessage({'msg':'kill'})				  	
				  }};


				  updateVisit(true);

				  return worker;
		


				  function updateVisit(newfvs)
				  {
					  if (worker.cid != undefined)
						clearTimeout(worker.cid)

					  worker.cid=setTimeout(function() {
 						worker.cid = undefined;
						  if (worker.inprogress)
							updateVisit()
						  else
							calcvis();
					  },250);

					  function calcvis()
					  {
					  	  if (tck.fibers.content ==undefined || tck.fibers.content.tracts == undefined)
					  	  	 return;
						  worker.inprogress = true;
						  var fileObject = KViewer.dataManager.getFile(id);

						  var subset = tck.subsetToDisplay;
						  if (subset && subset.length == 0)
						  {
							subset = undefined;
							if (tck.Selection)
								subset = tck.Selection.subset;
						  }

						  worker.worker = createFiberVisitMap(tck.fibers.content.tracts,subset,endpoints,
											  fileObject,
											  viewer.viewport.progressSpinner,
						  function()
						  {

							  // redo parsing to get histogram right 
							  fileObject.content = prepareMedicalImageData(parse(fileObject.buffer), fileObject, {});

							  signalhandler.send("updateFilelink",{id:fileObject.fileID});
		/*					  var col = tck.color;
							  if (tck.Selection)
								 col = tck.Selection.color;
							  if (viewer.nii && viewer.nii.dummy)
								  viewer.setContent(fileObject,{intent:{}});
							  else
								  viewer.setContent(fileObject,{intent:{roi:1,roilim:100050,color:col-1}});
		*/			

							  if (newfvs)
							  {
							  	  worker.showInViewer(viewer);
							  	  newfvs = false;
							  }

							  if (!persistent)
							  	worker.kill();

							  worker.inprogress = false;
							 
						  }, worker );
					  }
				}
			}

            tck.createVisitMap = createVisitMap;


	


			function selectFibersByROI(tck,roi,minus,percentage,threshold)
			{
				  if (threshold == undefined)
				  	threshold = 0.5;

				  var tracts = tck.fibers.content.tracts;
				  var bbox_max = tck.fibers.content.tracts_max;
				  var bbox_min = tck.fibers.content.tracts_min;
				  var edges = math.inv(roi.content.edges);
				  var sz = roi.content.sizes;

				  viewer.$container.find("div[class='KViewPort_spinner']").show()
				  viewer.viewport.progressSpinner("building Bounding Box");
			
				  setTimeout(function() {				
				  KViewer.roiTool.computeBBox(roi);
				  var roi_bbox_max  = roi.bbox.max;
				  var roi_bbox_min  = roi.bbox.min;

				  function filter(k)
				  {
					   var tract = tracts[k];
					   var max = [bbox_max[3*k],bbox_max[3*k+1],bbox_max[3*k+2]];
					   var min = [bbox_min[3*k],bbox_min[3*k+1],bbox_min[3*k+2]];
					   for (var i = 0; i < 3;i++)
					   {
							if (max[i]<roi_bbox_min[i] | roi_bbox_max[i]<min[i])
								return;
					   }


					   var e =(edges)._data;
					   if (percentage > 0)
					   {
						   var hit = 0;
						   for (var j = 0; j < tract.length/3;j++)
						   {
							  var p = [Math.round(e[0][0]*tract[3*j] + e[0][1]*tract[3*j+1] + e[0][2]*tract[3*j+2] + e[0][3]),
									   Math.round(e[1][0]*tract[3*j] + e[1][1]*tract[3*j+1] + e[1][2]*tract[3*j+2] + e[1][3]),
									   Math.round(e[2][0]*tract[3*j] + e[2][1]*tract[3*j+1] + e[2][2]*tract[3*j+2] + e[2][3])];
							  if (p[0]>=0 && p[0] < sz[0] &&  p[1]>=0 && p[1] < sz[1] && p[2]>=0 && p[2] < sz[2] 
							  	  && roi.content.data[sz[0]*sz[1]*p[2] + sz[0]*p[1] + p[0]] > threshold)
								hit++;
							  if (hit/tract.length*3 > percentage)
							  {
								   tck.subsetToDisplay.push(k);
								   return;
							  }
						   }

					   }
					   else
						   for (var j = 0; j < tract.length/3;j++)
						   {
							  var p = [Math.round(e[0][0]*tract[3*j] + e[0][1]*tract[3*j+1] + e[0][2]*tract[3*j+2] + e[0][3]),
									   Math.round(e[1][0]*tract[3*j] + e[1][1]*tract[3*j+1] + e[1][2]*tract[3*j+2] + e[1][3]),
									   Math.round(e[2][0]*tract[3*j] + e[2][1]*tract[3*j+1] + e[2][2]*tract[3*j+2] + e[2][3])];
							  if (p[0]>=0 && p[0] < sz[0] &&  p[1]>=0 && p[1] < sz[1] && p[2]>=0 && p[2] < sz[2] 
							  	  && roi.content.data[sz[0]*sz[1]*p[2] + sz[0]*p[1] + p[0]] > threshold)
							  {
								 tck.subsetToDisplay.push(k);
								 return;
							  }
						   }
				  }

				  if (tck.subsetToDisplay == undefined) tck.subsetToDisplay = [];							  
				  if (tck.subsetToDisplay.length >0)
				  {
					 var subs = tck.subsetToDisplay;
					 tck.subsetToDisplay =[];
					 subs.chunk(
					   function(tract,k) { filter(subs[k]); },2048,1,
					   function(i) { viewer.viewport.progressSpinner("filtering " + Math.round(100*i/subs.length) + "%"); },
					   function()  { 
						if (minus)
							tck.subsetToDisplay = $(subs).not(tck.subsetToDisplay).get();

					   tck.updateFibers();	viewer.viewport.progressSpinner();  });
				  }
				  else
				  {
					 tck.subsetToDisplay =[];
					 tracts.chunk(
					   function(tract,k) { filter(k); },2048,1,
					   function(i) { viewer.viewport.progressSpinner("filtering " + Math.round(100*i/tracts.length) + "%"); },
					   function()  { 
						if (minus)
							tck.subsetToDisplay = invert(tck.subsetToDisplay,tracts.length);

					   tck.updateFibers();	viewer.viewport.progressSpinner();  });
				  }
				  tck.subsetToDisplay =[];
				  tck.fiberSign=[];


			   },0); 
			 } 

			function selectFibersByTemplate(tck,annot)
			{
				  var tracts = tck.fibers.content.tracts;
				  var tracts_len = tck.fibers.content.tracts_len;
				  var pts = annot.getPoints();
				  var nc = pts.length;
				  tck.subsetToDisplay =[];
				  tck.fiberSign=[];
				  if (nc > 1)
				  {

					  var ps = [];
					  var r = [];
					  var cum_d = [];
					  var d0  = 0;
					  for (var k = 0; k < nc;k++)
					  {
							var c = pts[k].p.coords;
							ps.push(c[0],c[1],c[2]);
							r.push(1/(pts[k].p.size*pts[k].p.size));
							var d = 0;
							if (k>0)
							{
								var c0 = pts[k-1].p.coords;
								var c1 = pts[k].p.coords;
								d = Math.sqrt( (c0[0]-c1[0])*(c0[0]-c1[0]) + (c0[1]-c1[1])*(c0[1]-c1[1]) + (c0[2]-c1[2])*(c0[2]-c1[2]) )
								if (d==0)
									return;
							}
							d0 += d;
							cum_d.push(d0);
					  }
					  for (var k = 0; k < nc;k++)
						  cum_d[k] /= cum_d[nc-1];

					  var dist = 0;
					  var dist2 = 0;
					  var sg;
					  var scale = 10;

					  for (var j = 0; j <tracts.length;j++)
					  {
						  var l = tracts_len[j]*0.99999999;
						  var dist = 0;
						  var dist2 = 0;
						  for (var k = 0; k < nc;k++)
						  {
							  var idx = Math.floor(cum_d[k]*l);
							  var dx = ps[3*k]   - tracts[j][3*idx];
							  var dy = ps[3*k+1] - tracts[j][3*idx+1];
							  var dz = ps[3*k+2] - tracts[j][3*idx+2];
							  dist += ((dx*dx+dy*dy+dz*dz)*r[k] < scale)?1:0;
						  }
						  for (var k = 0; k < nc;k++)
						  {
							  var idx = Math.floor(cum_d[k]*l);
							  var dx = ps[3*(nc-1-k)]   - tracts[j][3*idx];
							  var dy = ps[3*(nc-1-k)+1] - tracts[j][3*idx+1];
							  var dz = ps[3*(nc-1-k)+2] - tracts[j][3*idx+2];
							  dist2 += ((dx*dx+dy*dy+dz*dz)*r[k] < scale)?1:0;
						  }
							if (dist < dist2)
							{
								dist = dist2;
								sg = -1;
							}
							else
							{
								sg = 1;
							}
							if (dist/nc >= 0.999)
							{
								tck.subsetToDisplay.push(j);
								tck.fiberSign.push(sg);
							}    			      
					  }
				  }



				  tck.updateFibers();


			}

			function selectFibersByTemplate_old(tck,annot)
			{
				  var tracts = tck.fibers.content.tracts;
				  var pts = annot.getPoints();
				  var nc = pts.length;
				  tck.subsetToDisplay =[];
				  tck.fiberSign=[];
				  if (tck.fibers.content.sub_samp == undefined)
				  	 tck.fibers.content.sub_samp = {};
				  if (tck.fibers.content.sub_samp[nc] == undefined)
				  {			
				    var ss = [];	  	
				    for (var k = 0; k < tracts.length; k++)
						ss[k] =  reparam_track_constPcnt(tracts[k],undefined,nc);
					tck.fibers.content.sub_samp[nc] = ss;
				  }

				  var tc_ss = tck.fibers.content.sub_samp[nc];
			
				  var ps = [];
				  var r = [];
    			  for (var k = 0; k < nc;k++)
    			  {
						ps.push(pts[k].p.coords[0],pts[k].p.coords[1],pts[k].p.coords[2]);
						r.push(1/(pts[k].p.size*pts[k].p.size));
    			  }
    			  var sg = 1;
				  for (var j = 0; j < tc_ss.length;j++)
				  {
					var dist = 0;
				  	for (var k = 0; k < nc;k++)
				  	{
						var dx = ps[3*k]   - tc_ss[j][3*k];
						var dy = ps[3*k+1] - tc_ss[j][3*k+1];
						var dz = ps[3*k+2] - tc_ss[j][3*k+2];
						dist += ((dx*dx+dy*dy+dz*dz)*r[k] < 10)?1:0;

				  	}
					var dist2 = 0;
				  	for (var k = 0; k < nc;k++)
				  	{
						var dx = ps[3*(nc-1-k)]   - tc_ss[j][3*k];
						var dy = ps[3*(nc-1-k)+1] - tc_ss[j][3*k+1];
						var dz = ps[3*(nc-1-k)+2] - tc_ss[j][3*k+2];
						dist2 += ((dx*dx+dy*dy+dz*dz)*r[k] < 10)?1:0;

				  	}
				  	if (dist < dist2)
				  	{
				  		dist = dist2;
				  		sg = -1;
				  	}
				  	else
				  	{
				  		sg = 1;
				  	}
				  	if (dist/nc >= 0.999)
				  	{
				  		tck.subsetToDisplay.push(j);
					    tck.fiberSign.push(sg);
				  	}

				  }
				    tck.updateFibers();



			}


			function selectFibersByCurrent(tck,current,thres)
			{

				  var tracts = tck.fibers.content.tracts;
				  var bbox_max = tck.fibers.content.tracts_max;
				  var bbox_min = tck.fibers.content.tracts_min;
				  var edges = math.inv(current.content.edges);
				  var sz = current.content.sizes;
				  var totsz = sz[0]*sz[1]*sz[2];

				  viewer.$container.find("div[class='KViewPort_spinner']").show()
				  viewer.viewport.progressSpinner("building Bounding Box");

			
				  setTimeout(function() {				
				  var roi_bbox_max  = current.content.bbox.max;
				  var roi_bbox_min  = current.content.bbox.min;
				  var data = current.content.data;

				  function filter(k)
				  {
					   var tract = tracts[k];
					   var max = [bbox_max[3*k],bbox_max[3*k+1],bbox_max[3*k+2]];
					   var min = [bbox_min[3*k],bbox_min[3*k+1],bbox_min[3*k+2]];
					/*   for (var i = 0; i < 3;i++)
					   {
							if (max[i]<roi_bbox_min[i] | roi_bbox_max[i]<min[i])
								return;
					   }

*/
					   var e = edges._data;
					   var p0 ;
					   var v0 ;
					   var abscur = 0;
					   for (var j = 0; j < tract.length/3;j++)
					   {
						  var p = [tract[3*j],tract[3*j+1],tract[3*j+2]];
						  var v = [ trilinInterp(current.content,p[0],p[1],p[2],e,0),
						  			trilinInterp(current.content,p[0],p[1],p[2],e,totsz),
						  			trilinInterp(current.content,p[0],p[1],p[2],e,totsz*2)];

						  if (p0 !=undefined)
						  {
							  var proj = v[0]*(p[0]-p0[0])+v[1]*(p[1]-p0[1])+v[2]*(p[2]-p0[2]);
							  if (!isNaN(proj))
							  	abscur += proj*proj;
						  }
						  
						  p0 = p;

						  if (abscur > thres*thres)
						  {
						  	tck.subsetToDisplay.push(k);
						  	break;
						  }
					   }
				  }



				  tck.subsetToDisplay =[];
				  tck.fiberSign=[];

				  var offs = 0;
				  var cid = setInterval(function()
				  {
				  	  for (var j = 0 ; j < 2048 & (j+offs) < tracts.length; j++)
				  	  	 filter(j+offs);
				  	  offs += 2048;
				  	  if (offs >= tracts.length)
				  	  {
				  	  	 clearInterval(cid);
				  	  	 viewer.viewport.progressSpinner(); 
				  	  }
				  	  else
                      	 viewer.viewport.progressSpinner("filtering " + Math.round(100*offs/tracts.length) + "%"); 				  	 
                      tck.updateFibers();	

				  });

/*

					 tracts.chunk(
					   function(tract,k) { filter(k); },2048,1,
					   function(i) { viewer.viewport.progressSpinner("filtering " + Math.round(100*i/tracts.length) + "%"); },
					   function()  { 
					   tck.updateFibers();	viewer.viewport.progressSpinner();  });
*/
			   },0); 
			 } 








	        /***************************************************************************************
		     * close the viewer
		     ****************************************************************************************/

  			 function close()
             {
				  if (tck.children)
				  {
				  	var childs = tck.children.slice(0);
				  	for (var k = 0 ; k < childs.length;k++)
				  		childs[k].close();
				  }
				  if (tck.fibtrackWorker)
				  {
				  	 tck.fibtrackWorker.kill()
				  }

				  if (tck.visitworker)
				  	tck.visitworker.kill();
				  if (tck.visitworker_terms)
				  	tck.visitworker_terms.kill();

				  if (!tck.isParentView)
				  {
				  	 for (var k = 0 ; k < tck.parent.children.length; k++)
				  	 {
					  	 if (tck.parent.children[k] == tck)
					  	 {
					  	 	tck.parent.children.splice(k,1);
					  	 	break;
					  	 }
				  	 }

				  }

				  if (tck.sid_climchange != undefined)
						 signalhandler.detach("climChange",tck.sid_climchange);
				  if (tck.osid_climchange != undefined)
						 signalhandler.detach("overlay_climChange",tck.osid_climchange);

				  if ( (tck.isParentView && tck.trackingVol != undefined) ||
				  	  (tck.parent != undefined && tck.parent.fibers.content && tck.parent.fibers.content.octreeWorker !=  tck.fibers.content.octreeWorker   ) )
				  {
				  	
				  	 if (tck.fibers.content.octreeWorker != undefined)
					 		tck.fibers.content.octreeWorker.kill();
				  }

             	  if (viewer.gl != undefined)
             	  {
					  viewer.gl.detachShader(fiberDirColor_shader);
					  for (var k = 0; k< tck.divs.length;k++)
						 tck.divs[k].remove();
					  for (var k = 0; k < viewer.objects3D.length;k++)
					  {
						if (tck == viewer.objects3D[k])
						{
							if (viewer.objects3D[k].fiberUpdater != undefined)
									viewer.objects3D[k].fiberUpdater.clear();
							viewer.objects3D.splice(k,1);
							break;
						}
					  }
					  removeAnnotationAssoc();

					  viewer.gl.activateRenderLoop();
					  if (viewer.objects3D.length == 0 & viewer.nii == undefined)
						viewer.$canvas3D.hide();
             	  }

             	  for (var k=0; k < viewer.overlays.length;k++)
             	  {
             	  	if (viewer.overlays[k].content.content == tck.trackingVol)
             	  	{
             	  		viewer.overlays[k].close()	;
             	  		break;
             	  	}
             	  }

             	  viewer.toolbar.update("fiber");

				  if (viewer.nii && viewer.nii.dummy && viewer.objects3D.length == 0)
				  	viewer.close();

             }
             tck.close = close;
             signalhandler.attach("close",close);


	        /***************************************************************************************
		     * select this fiberview as current active for (just concerns picker)
		     ****************************************************************************************/




			 function makeCurrent(e)
			 {
			 	 var lastassoc =-1 ;
				 for (var k = 0; k < viewer.objects3D.length;k++)
				 {
					
					if (tck != viewer.objects3D[k])
					{
						if (viewer.objects3D[k].fibers != undefined)
						{
							if (viewer.objects3D[k].isCurrent)
					   		    lastassoc = viewer.objects3D[k].associated_annotation;
							if (e && e.shiftKey)
								;
							else
							{
								//removeAnnotationAssoc();
								viewer.objects3D[k].selectFibersReset('none');
							}
							viewer.objects3D[k].isCurrent = false;
							viewer.objects3D[k].$currentpickerdiv.removeClass("current");
							viewer.objects3D[k].$captiondiv.removeClass("current");
						}

					}
				 }
 			     tck.isCurrent = true;
			     setAnnotationAssoc(lastassoc);	
				 if (lastassoc == -1)
			 	    selectFibersReset('all');				  	  					  	  
			     tck.$currentpickerdiv.addClass("current");
			     tck.$captiondiv.addClass("current");
			 }


			 
			 if (intent.visible == undefined)
			 	intent.visible = true;
			
			 if (!intent.donotmakecurrent)
			 	intent.donotmakecurrent = false;


		 	
			 if (!intent.donotmakecurrent)
			 {
			 	makeCurrent();
			 }
			 if (!intent.visible)
			 	tck.subsetToDisplay = [];	

			 if (intent != undefined)
			 {
				if(intent.assoc_annot != undefined)
					setAnnotationAssoc(intent.assoc_annot);
				else if (intent.assoc != undefined)
					setAnnotationAssoc(intent.assoc);		
			 }

			 


		     tck.updateFibers();

             return tck;
        }





  	 /***************************************************************************************
	  * the surface subview
	  ****************************************************************************************/


	  that.surfacecnter = 0;
      that.createSurfaceView = function(fobj,viewer,intent)
      {
            var viewer = viewer;
            var obj = { surf:fobj,
                        color: (that.surfacecnter++)%6,
                        alpha:0.8,
                        gamma:1,
						exposure:0,                        
                        alphaMode:0,
                        wire:false,
                        cuts:[0,0,0],
                        overlays:[],
                        beltwidth:0,
                        pickable:true,
                        visible:true,
                        type:"surface",
						uid: KObject3DTool.uidCnter++,
            };


			obj.getViewProperties = function()
			{
				return {color:this.color,
						wire:this.wire,
						alpha:this.alpha,
						alphaMode:this.alphaMode,
						cuts:this.cuts,
						beltwidth:this.beltwidth,						
						visible:this.visible};
			}


			obj = $.extend(obj,intent);

 		    /***************************************************************************************
		    * the viewer toolbar
			****************************************************************************************/

			// color contextmenu
			var cols = [].concat(KColor.list)
			cols[9] = [255,255,255];
       	    obj.colors = cols;
	
       	    function colencode(c) {	if (c != undefined)
       	    							return "background:"+RGB2HTML(c[0],c[1],c[2])+";"; 
       	    					    else
       	    					    	return "background:"+RGB2HTML(0,0,0)+";"; }
			var $colselector = KColorSelector(obj.colors,colencode,
				 function() {viewer.gl.setSurfColor(obj); 
				 			 obj.update();
				 			 viewer.gl.activateRenderLoop(); },obj);
		
			var $captiondiv,$cutdiv,$dragdiv,$visdiv,$griddiv,$alphadiv;
            obj.divs = [ 	$("<br style='clear:both' />"),
                          $("<div  class='KViewPort_tool surface persistent'>  <i class='fa fa-close fa-1x'></i></div>").click( close  )
                          .mousedown(viewer.viewport.closeContextMenu(obj)),
                          $cutdiv=$("<div  class='KViewPort_tool surface' >  <i   class='fa fa-cut fa-1x'></i></div>").click( cutContextmenu ),
                          $colselector,
                          $visdiv = $("<div  class='KViewPort_tool surface'>  <i class='fa fa-eye fa-1x'></i></div>").click( toggleVisibility  ),
                          $alphadiv = $("<div  class='KViewPort_tool surface'>  <i class='fa fa-alpha fa-1x'>&#945;	</i></div>") .click( toggleAlpha  ),                             
                          $griddiv = $("<div  class='KViewPort_tool surface'>  <i class='fa fa-th fa-1x'>	</i></div>") .click( toggleWire  ),                             
                          $captiondiv = $("<div  class='KViewPort_tool surface caption'> "+obj.surf.filename+"</div>"),
                          $dragdiv = $("<div  class='KViewPort_tool draganddrop surface'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>"),
                         
                       ];

			if (fobj.content.vals != undefined)
			{
				obj.histoManager = viewer.createHistoManager();
				obj.histoManager.nii = { datascaling : {e:function(x){return x;} }, 
										 histogram: obj.surf.content.histogram};
				obj.histoManager.onclimchange = function(ev) {				   viewer.gl.activateRenderLoop(); obj.update();}
				obj.histoManager.oncmapchange= function(ev) {				   viewer.gl.activateRenderLoop(); obj.update();}



				if (intent.clim)
					obj.histoManager.clim = [intent.clim[0],intent.clim[1]];
				else
				{ 									 
					var histogram = obj.surf.content.histogram;
					obj.histoManager.clim = [histogram.min+0.1*(histogram.max-histogram.min),					
                                             histogram.max+0.1*(histogram.max-histogram.min)]
				}
			



				obj.histoManager.updateHistogramClim();
				obj.histoManager.layoutHistogram();

			}

			if (obj.surf.fileinfo.roireference == undefined || 
				obj.surf.toolbar_visible)
			{
				viewer.toolbar.append(obj.divs,'surface')
				obj.toolbarAttached = true;

			}

			$captiondiv.on('mouseenter',function(){				
				 obj.alphaMode = (obj.alphaMode+1)%6;
				 update();
			});
			$captiondiv.on('mouseleave',function(){	
				  obj.alphaMode = (obj.alphaMode+5)%6;			
				  update();
			});

			var exTimeout = function(fun,time)
			{
				if (fun.id !== undefined)
					clearTimeout(fun.id);
				fun.id = setTimeout(fun,time);					

			}

			obj.$captiondiv = $captiondiv;


            $dragdiv.attr("draggable",'true');
            $dragdiv.on("dragstart",
						dragstarter(function() {
						return {
							type: 'file',
							mime: 'surf',
							filename:  obj.surf.filename,
							fileID:  obj.surf.fileID,
							intent: {							
								color:obj.color
							},
							close: close
						}}));

			obj.contextmenu3D = function(evt,pickResult,p)
		    {
				   var contextMenu = KContextMenu(
					  function() {

						var $menu =  $("<ul class='menu_context'>");

						$menu.append($("<li onchoice='color' > Color  </li>"));
						$menu.append($("<li onchoice='crop' > xCrop connected comp.  </li>"));
						return  $menu;
					  },
					  function(str,ev)
					  { if (str == "color")
						{
						     var $dummy = KColorSelector(obj.colors,colencode,
							 function() {viewer.gl.setSurfColor(obj); 
										if (obj.refRoiView != undefined)
										{
											obj.refRoiView.color = obj.color;
											obj.refRoiView.$colselector.attr('style',colencode(obj.colors[obj.color]));
											viewer.drawSlice();
										}
										$colselector.attr('style',colencode(obj.colors[obj.color]));
							 },obj);
							 var e = new jQuery.Event("click");
							 e.pageX = ev.clientX;
							 e.pageY = ev.clientY;
							 $dummy.trigger(e);
						}
						else if (str == 'crop')
						{
							var p = viewer.gl.flip(pickResult.pickedPoint);
							p = viewer.gl.GL2world([p.x,p.y,p.z]);
							var roi = obj.surf.fileinfo.roireference;
							cropConnectedComponent(roi,p);
							//var surf = _this.viewer.currentROI.fileinfo.surfreference;


     						KViewer.roiTool.update3D(roi);
							/*
							that.computeIsoSurf2(roi,undefined,viewer.viewport.progressSpinner,function()
							{
									for (var j=0;j < obj.surf.content.update.length;j++) 
											obj.surf.content.update[j]();	

									signalhandler.send('positionChange');
							});*/
						}


					  },true);
				  contextMenu(evt);
	 		
		   }
	






			toggleAlpha(undefined,obj.alphaMode)
			function toggleAlpha(e,s)
			{
				 if (s == undefined)
				 	obj.alphaMode = (obj.alphaMode+1)%6;
				 else 
				   obj.alphaMode = s;
				 if (obj.alphaMode>0)
					 $alphadiv.css('color','red');
				 else
					 $alphadiv.css('color','initial');
				 update();

			}

			toggleWire(undefined,obj.wire)
         	function toggleWire(e,s)
			{
				 if (s == undefined)
				 	obj.wire = !obj.wire;
				 else
				 	obj.wire = s;
				 if (obj.wire)
					 $griddiv.css('color','red');
				 else
					 $griddiv.css('color','initial');
				 update();

			}
         
			function toggleVisibility(e)
			{
				 var $t= $($visdiv.children()[0]);
				 if (obj.visible)
				 {
					 obj.visible = false;
					 $t.addClass('fa-eye-slash').removeClass('fa-eye').css('color','red');;
				 }
				 else
				 {
					 obj.visible = true;
					 $t.removeClass('fa-eye-slash').addClass('fa-eye').css('color','initial');
				 }
				 update();
			}


                  	
		    /***************************************************************************************
		    * rendering and updates
			****************************************************************************************/                  	
		 	 function update()
			 {
			 	if (viewer.gl != undefined)
					viewer.gl.createSurface(obj);
			 }
			 obj.update = update;


	
			 // the surface objs knows all its views via this updates
			 if (obj.surf.content.update != undefined)
				obj.surf.content.update.push(obj.update);

			 obj.updateCut = function(c)
			 {
			 	if (obj.share != undefined)
		 			obj.shader.setVector3("planesCut",new BABYLON.Vector3(c[0],c[1],c[2]));
			 }

	




			 var cutContextmenu = new KContextMenu(
				  function() { 
					 var $menu = $("<ul class='menu_context'>");
					 var name = ['Saggital','Coronal','Transversal'];
					 $menu.append($("<hr width='100%'> ")); 					 					
					 $menu.append($("<span> &nbsp Cuts</span>"));
					 $menu.append($("<hr width='100%'> ")); 		
					 var cutnames = ['left','no cut','right'];
					 for (var k = 0;k <3;k++)
 					 	$menu.append($("<li  onchoice='vis_"+k+"' > "+name[k]+" ("+cutnames[obj.cuts[k]+1]+") </li>"));
			
  					 $menu.append($("<hr>"));

        			  var $belt = $("<input onchoice='preventSelection' type='number' step='0.5' min='0' max='100'>").val(obj.beltwidth).
   		            		 on('change', function(ev) {
                      var $input = $(ev.target);
                    		obj.beltwidth = $input.val();
                            obj.update();
                	       });
                	  $menu.append($("<li  onchoice='preventSelection'> Beltwidth: </li>").append($belt));
   


					return $menu; 
				  }, function(str,ev)
				  {
				  	  if (str == '' | str == undefined)
				  	  	return;
					  
				  	  if (str.search("vis") != -1)
				  	  {
				  	  	  str = str.substring(4);
						  var pl = parseInt(str);
			  		      obj.cuts[pl] = (obj.cuts[pl]+2)%3 -1;
				  	  }

				  	  obj.update();

				  },undefined,true);
			$cutdiv.click( cutContextmenu )











	

			 obj.clear = function()
			 {
				 delete this.surf;
			 }

		    /***************************************************************************************
		    * close the view
			****************************************************************************************/                  	
  			 function close()
             {             	  

			      if (obj.histoManager != undefined) 
			      		obj.histoManager.remove();


				  if (obj.surf.content != undefined)			  
					  if (obj.surf.content.update != undefined)  // roi update handler remove
						  for (var k = 0; k < obj.surf.content.update.length;k++)
						  {
							  if (obj.update == obj.surf.content.update[k])
							  {
								obj.surf.content.update.splice(k,1);
								break;
							  }
						  }

				   for (var k = 0; k < obj.overlays.length;k++)
				   {
				   	  obj.overlays[k].close();
				   }
					  
				  if (obj.shader != undefined && viewer.gl != undefined) // shader update handler remove
					viewer.gl.detachShader(obj.shader);

                  for (var k = 0; k< obj.divs.length;k++)
                     obj.divs[k].remove();

                  for (var k = 0; k < viewer.objects3D.length;k++)
                  {
                  	if (obj == viewer.objects3D[k])
                  	{
                  		viewer.objects3D.splice(k,1);
                  		break;
                  	}
                  }					
				  if (viewer.objects3D.length == 0 & viewer.nii == undefined)
				  	viewer.$canvas3D.hide();
				  if (obj.gl != undefined)
				  {
					  obj.gl.dispose();
					  obj.gl = undefined;
				  }
				  if (viewer.gl != undefined)				  	
				  	viewer.gl.activateRenderLoop();
             }
             obj.close = close;
             signalhandler.attach("close",close);


		     obj.update();

             return obj;
        }













  	 /***************************************************************************************
	  * the conmatrix subview
	  ****************************************************************************************/



      that.createConmatView = function(fobj,viewer,intent)
      {
            var viewer = viewer;
            var obj = { cmat:fobj,
                        visible:true,
						uid: KObject3DTool.uidCnter++,
						histoManager: viewer.createHistoManager()
            };

			obj.histoManager.nii = { datascaling : {e:function(x){return x;} }, 
									 histogram: obj.cmat.histogram};

			if (intent.clim)
				obj.histoManager.clim = [intent.clim[0],intent.clim[1]];
			else 									 
				obj.histoManager.clim = [obj.cmat.histogram.min+0.6*(obj.cmat.histogram.max-obj.cmat.histogram.min),
                                             obj.cmat.histogram.max+0.1*(obj.cmat.histogram.max-obj.cmat.histogram.min)]
			
			obj.histoManager.onclimchange = function(ev) {				   viewer.gl.activateRenderLoop(); obj.update();}

			obj.histoManager.updateHistogramClim();
			obj.histoManager.layoutHistogram();

			obj = $.extend(obj,intent);

 		    /***************************************************************************************
		    * the viewer toolbar
			****************************************************************************************/

		
			var $captiondiv,$cutdiv,$dragdiv,$visdiv;
            obj.divs = [  $("<br style='clear:both' />"),
                          $("<div  class='KViewPort_tool cmat persistent'>  <i class='fa fa-close fa-1x'></i></div>").click( close  ),
                          $captiondiv = $("<div  class='KViewPort_tool cmat caption'> "+obj.cmat.filename+"</div>"),
                          $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>"),
                          
                       ];

			viewer.toolbar.append(obj.divs,'cmat');

            $dragdiv.attr("draggable",'true');
            $dragdiv.on("dragstart", dragstarter({ type:'file', mime: 'conmat',   filename: obj.cmat.filename,  fileID: obj.cmat.fileID,close:close}));




/*
			obj.contextmenu3D = function(evt,pickResult,p)
		    {
				   var contextMenu = KContextMenu(
					  function() {

						var $menu =  $("<ul class='menu_context'>");

						$menu.append($("<li onchoice='crop' > ssCrop connected comp.  </li>"));
						$menu.append($("<li onchoice='color' > Color  </li>"));
						return  $menu;
					  },
					  function(str,ev)
					  { if (str == "color")
						{
						     var $dummy = KColorSelector(obj.colors,colencode,
							 function() {viewer.gl.setSurfColor(obj); 
										if (obj.refRoiView != undefined)
										{
											obj.refRoiView.color = obj.color;
											obj.refRoiView.$colselector.attr('style',colencode(obj.colors[obj.color]));
											viewer.drawSlice();
										}
										$colselector.attr('style',colencode(obj.colors[obj.color]));
							 },obj);
							 var e = new jQuery.Event("click");
							 e.pageX = ev.clientX;
							 e.pageY = ev.clientY;
							 $dummy.trigger(e);
						}
						else if (str == 'crop')
						{
							var roi = obj.surf.fileinfo.roireference;
							cropConnectedComponent(roi,p);

						}


					  },true);
				  contextMenu(evt);
	 		
		   }
*/	


                  	
		    /***************************************************************************************
		    * rendering and updates
			****************************************************************************************/                  	
		 	 function update()
			 {
			 	if (viewer.gl != undefined)
					viewer.gl.createConmat(obj);
			 }
			 obj.update = update;

	
			 // the surface objs knows all its views via this updates
			 if (obj.cmat.content.update != undefined)
				obj.cmat.content.update.push(obj.update);


			 obj.clear = function()
			 {
				 delete this.surf;
			 }

		    /***************************************************************************************
		    * close the view
			****************************************************************************************/                  	
  			 function close()
             {             	  
					  
			      obj.histoManager.remove();

				  if (obj.shader != undefined) // shader update handler remove
					viewer.gl.detachShader(obj.shader);

                  for (var k = 0; k< obj.divs.length;k++)
                     obj.divs[k].remove();

                  for (var k = 0; k < viewer.objects3D.length;k++)
                  {
                  	if (obj == viewer.objects3D[k])
                  	{
                  		viewer.objects3D.splice(k,1);
                  		break;
                  	}
                  }					
				  if (viewer.gl)
                  	viewer.gl.activateRenderLoop();
                  
				  if (viewer.objects3D.length == 0 & viewer.nii == undefined)
				  	viewer.$canvas3D.hide();

				  if (obj.gl != undefined)
				  {
					  obj.gl.dispose();
					  obj.gl = undefined;
				  }
             }
             obj.close = close;
             signalhandler.attach("close",close);


		     obj.update();

             return obj;
        }





  	 /***************************************************************************************
	  * the contour subview
	  ****************************************************************************************/



      that.createContourView = function(fobj,viewer,intent)
      {
            var viewer = viewer;
            var obj = { contour:fobj,
                        visible:true,
						uid: KObject3DTool.uidCnter++,
						fibcut_thres:3.5,
						fib_cut:-1,
						select:0,
						color: (viewer.objects3D.length)%KColor.list.length,		
            };


       	    var colors = [];
       	    colors = colors.concat(KColor.list);

			if (intent != undefined && intent.color != undefined)
				obj.color = intent.color%colors.length ;


			////////////// color context menu
			var $colselector = KColorSelector(colors,	
				 function(c) {	if (c=="dir") return ""; else return "background:"+RGB2HTML(c[0],c[1],c[2])+";"; },
				 function (col)
				 {
				 	if (obj.fiberDirColor_shader != undefined)
				 	{
					   viewer.gl.activateRenderLoop();
						if (col == 'dir')
							obj.fiberDirColor_shader.setVector4("col",new BABYLON.Vector4(0,0,0,0));
						else
							obj.fiberDirColor_shader.setVector4("col",new BABYLON.Vector4(col[0]/255,col[1]/255,col[2]/255,1));
				 	}
				 	obj.update()
				 },
				 obj);

			if (intent.gl) delete intent.gl;
			obj = $.extend(obj,intent);

 		    /***************************************************************************************
		    * the viewer toolbar
			****************************************************************************************/

		
			var $captiondiv,$cutdiv,$dragdiv,$visdiv,$roidiv,$fibercutselector;

            var name;// = obj.contour.filename

            if (intent.select != undefined)
                name = obj.contour.content.Contours[intent.select].name;
            
            name = name || obj.contour.filename


            obj.divs = [  $("<br style='clear:both' />"),
                          $("<div  class='KViewPort_tool cmat persistent'>  <i class='fa fa-close fa-1x'></i></div>").click( close  ),
                          $captiondiv = $("<div  class='KViewPort_tool cmat caption'> "+name+"</div>"),
                          $colselector.appendTooltip("selectcolor"),
                           $fibercutselector = $("<div  class='KViewPort_tool cmat' >  <i   class='fa fa-cut fa-1x'></i></div>"),
                           $roidiv = $("<div  class='KViewPort_tool cmat' >  <i   class='fa fa-pencil fa-1x'></i></div>"),
                          $dragdiv = $("<div  class='KViewPort_tool draganddrop'>  <i class='fa fa-hand-paper-o fa-1x'></i></div>"),
                          
                       ];

            $roidiv.click(function() {
				$(document.body).addClass("wait");
				viewer.viewport.progressSpinner("creating ROI from rtstruct ...")

  			    var c = obj.contour.content.Contours[intent.select].ContourSequence.node;
            	setTimeout(function() {
					master.roiTool.pushROI(viewer.currentFileID,name, undefined, function(fobj){
					for (var k = 0; k < c.length;k++)
					//for (var k = 200; k < 205;k++)
					{
						var p = c[k].ContourData;
						var pts = [];
						for (var i = 0; i < p.length/3;i++)
							pts.push([-p[3*i],-p[3*i+1],p[3*i+2],1]);
						// close the polygon with first point
						var i = 0;
						pts.push([-p[3*i],-p[3*i+1],p[3*i+2],1])							

						fillPolygon(pts,fobj.content, false)

					}
					viewer.setContent(fobj, {
						intent: {
							ROI: true,
							color:obj.color
						}
					});
					$(document.body).removeClass("wait");
					viewer.viewport.progressSpinner()

					});

                },0);
            });

			viewer.toolbar.append(obj.divs,'cmat');

            $dragdiv.attr("draggable",'true');
            $dragdiv.on("dragstart", dragstarter({ type:'file', mime: 'contour',   filename: obj.contour.filename,  
            fileID: obj.contour.fileID,close:close, intent:'color:'+obj.color+',select:'+intent.select+''     }));
            
			obj.createShader = function()
			{
				var fiberDirColor_shader = viewer.gl.createFiberShader()
				fiberDirColor_shader.setFloat("planesThres",obj.fibcut_thres);   	
				fiberDirColor_shader.setFloat("planesNum",obj.fib_cut);
				fiberDirColor_shader.setFloat("planesProj",obj.fibcut_proj);
				obj.fiberDirColor_shader = fiberDirColor_shader;
			}

            if (viewer.gl != undefined)
            {
            	obj.createShader()
            }
            		
     		var fibcut_contextmenu = new KContextMenu(
				  function() { 
					 var $menu = $("<ul class='menu_context'>");
					 var name = ['No cut','Coronal','Transversal','Saggital'];
					 var sel = ['','','','']; sel[obj.fibcut+1] = 'dot-';
					 for (var k = -1;k <3;k++)
 					 	$menu.append($("<li  onchoice='"+k+"' > "+name[k+1]+"  <i  onchoice='"+k+"' class='fa fa-"+sel[k+1]+"circle-o'></i> </li>"));
				      if (obj.fibcut != -1)
				      {

						  var $thres = $("<input onchoice='preventSelection' type='number' min='0.01' step='0.1' max='20'>").val(obj.fibcut_thres).
						  on('change',function(ev){
							var $input = $(ev.target);
							obj.fibcut_thres = $input.val();
							obj.fiberDirColor_shader.setFloat("planesThres",parseFloat(obj.fibcut_thres));   	
							 viewer.gl.activateRenderLoop();
						  });
						  $menu.append($("<li  onchoice='preventSelection'> Width: </li>").append($thres));
				      }
				    $menu.append($("<hr width='100%'> ")); 		
				    var sel = '';
				    if (obj.fibcut_proj>0) sel = '-check';			 				       
 				    $menu.append($("<li onchoice='project'> Projection  <i onchoice='project' class='fa fa"+sel+"-square-o'></i> </li>"));
					return $menu; 
				  },
				  function(str,ev)
				  {

				  	  if (str == '' | str == undefined)
				  	  	return;
				  	  if (str == '-1' | str == '0' | str == '1' | str == '2' )
				  	  {
				         obj.fibcut = parseInt(str);
				         obj.fiberDirColor_shader.setFloat("planesNum",obj.fibcut);
				         obj.fiberDirColor_shader.setFloat("planesProj",obj.fibcut_proj);
				  	  }
				  	  if (str == 'project')
				  	  {
				  	  	  obj.fibcut_proj = -obj.fibcut_proj;
				          obj.fiberDirColor_shader.setFloat("planesProj",obj.fibcut_proj);
				  	  }
				  	  viewer.gl.activateRenderLoop();
				  }
				  );
			 $fibercutselector.click(fibcut_contextmenu);





                  	
		    /***************************************************************************************
		    * rendering and updates
			****************************************************************************************/                  	
		 	 function update()
			 {
			 	if (viewer.gl != undefined)
					viewer.gl.createContour(obj,colors[obj.color]);
				if (obj.outlines != undefined)
					obj.outlines.update(viewer)
			 }
			 obj.update = update;


		    /***************************************************************************************
		    * close the view
			****************************************************************************************/                  	
  			 function close()
             {             	  

                  if (obj.outlines) 
                      obj.outlines.close()

                  for (var k = 0; k< obj.divs.length;k++)
                     obj.divs[k].remove();

                  for (var k = 0; k < viewer.objects3D.length;k++)
                  {
                  	if (obj == viewer.objects3D[k])
                  	{
                  		viewer.objects3D.splice(k,1);
                  		break;
                  	}
                  }					
				  if (viewer.gl)
                  	viewer.gl.activateRenderLoop();
                  
				  if (viewer.objects3D.length == 0 & viewer.nii == undefined)
				  	viewer.$canvas3D.hide();

				  if (obj.gl != undefined)
				  {
				  	  if (obj.gl.dispose)
					  	obj.gl.dispose();
					  obj.gl = undefined;
				  }
             }
             obj.close = close;
             signalhandler.attach("close",close);


		     obj.update();

             return obj;
        }




    function statistics_dialog(parent)
    {
    	var objtool = parent;
        var that = new dialog_generic();
        that.$frame.hide()
        $("<li><a>Object statistics</a></li>").appendTo(that.$menu)
        $("<li><a> <i class='fa fa-refresh'></i> </a>  </li>").click(dostats).appendTo(that.$menu);

        //that.$container.append($("<div id='roistatsdialog'></div>"));

        function computeStats(roi, img)
        {
        }



        /***************************************************************************************
        * new statistics table
        ****************************************************************************************/
        function dostats()
        {
            var objs = objtool.objs;


            that.$container.find(".KRoistats_tablecontainer").remove();
            
            var $div = $("<div class='KRoistats_tablecontainer'></div>").appendTo(that.$container);

            var $table = $("<table class='KRoistats_table text_selectable'></table>").appendTo($div);
            
            var $row = $("<tr> <td>Object</td> <td>#tracts</td>   </tr>").appendTo( $("<thead></thead>").appendTo($table ));
            //var $row0 = $("<tr> <td></td> <td></td>   </tr>").appendTo($table0);
            var $tbody = $("<tbody></tbody>").appendTo($table);

            for (var id in objs)
            {

                var x= objs[id];


				var $trow = $("<tr></tr>").appendTo($tbody);
                $("<td >" + x.filename + "</td>").appendTo($trow);
                 $("<td>" + x.content.tracts.length      +"</td>").appendTo($trow);

                 if (x.content.selections != undefined)
                 {
                 	var selections = x.content.selections
                 	for (var j = 0 ; j < selections.length; j++)
                 	{
						var $trow = $("<tr></tr>").appendTo($tbody);
						$("<td >" +selections[j].name + "</td>").appendTo($trow);
						$("<td>" +selections[j].subset.length      +"</td>").appendTo($trow);

                 	}
                 }


            }


            

        }

        that.dostats = dostats;
        
        return that;
    }

    var fibhist =  {
    	qsize:10,
    	queue:[],
    	which:undefined, 
    	last:0,    
    	current:0,
    	curw:0,
    	init: function(which)
    	{
    		    fibhist.queues = [];
    		    fibhist.current = 0;
    		    fibhist.which = which

    	},

    	add: function(which,selection)
    	{
    		var now = new Date().getTime()
    		if (Math.abs(fibhist.last-now) < 100 | selection.length == 0)
    		    return;

            fibhist.last = now;
    		if (which != fibhist.which)
    		{
    		    fibhist.init(which)
    		}
			fibhist.current = (fibhist.current+1)%fibhist.qsize
			fibhist.queue[fibhist.current] = selection
			fibhist.curw=0;
    	},

   	    goto: function(x)
    	{
            if (fibhist.which.isCurrent)
            {
            	if (fibhist.curw+x > 0 | fibhist.curw+x<=-fibhist.qsize)
            	    return;

            	fibhist.curw+=x;
				fibhist.current = fibhist.current+x;
				if (fibhist.current < 0)
					fibhist.current += fibhist.qsize;
				fibhist.current = fibhist.current%fibhist.qsize
				var s = fibhist.queue[fibhist.current]
				if (s==undefined)
				{
					if (fibhist.which.Selection)
					  s = fibhist.which.Selection.subset
				}
				fibhist.which.subsetToDisplay=s;
				fibhist.which.updateFibers()
				
            }
    	}


    }
    that.fiberHistory = fibhist


    document.addEventListener("keydown", function(evt)
    {
        evt = evt || window.event;

        if ($(evt.target).is("textarea") || $(evt.target).is("input"))
            return;
        if ((evt.which == 90 || evt.keyCode == 90) && evt.ctrlKey && !evt.shiftKey)
        {
         
             that.fiberHistory.goto(-1);
             evt.preventDefault();evt.stopPropagation();return false;

        }
        else if ((evt.which == 90 || evt.keyCode == 90) && evt.ctrlKey && evt.shiftKey)
        {
            that.fiberHistory.goto(+1);
            evt.preventDefault();evt.stopPropagation();return false;
        }
    });




  that.update();


  return that;
}
 
KObject3DTool.uidCnter = 0;
 












/***************************************************************************************
*  Octree wrapper
****************************************************************************************/


function myOctree(min,max,acc)
{
	this.min = min;
	this.max = max;
	this.cnt = 0;
	this.acc = 0;
	this.trees = [];
	this.addTree();
}

myOctree.chunksize = 100000;
myOctree.fiberstep = 1;

myOctree.prototype.addTree = function()
{
	var min = this.min;
	var max = this.max;
	this.trees.push(new Octree([min[0],min[1],min[2]],[max[0]-min[0],max[1]-min[1],max[2]-min[2]]));
}

myOctree.prototype.add = function (tract, label) {

	var octree = this.trees[this.trees.length-1];
	for (var k = 0; k < tract.length/3;k+=myOctree.fiberstep)
	{
		var dif =  [(tract[3*k]  -tract[3*(k-1)]),
		            (tract[3*k+1]-tract[3*(k-1)+1]),
		            (tract[3*k+2]-tract[3*(k-1)+2])];
		var mdif = math.sqrt(dif[0]*dif[0]+dif[1]*dif[1]+dif[2]*dif[2]);
		octree.add([tract[3*k],tract[3*k+1],tract[3*k+2]], [label,dif[0]/mdif,dif[1]/mdif,dif[2]/mdif]);
	}
	if (octree.numPoints > myOctree.chunksize)
		this.addTree();				
}


myOctree.prototype.findFibers = function(p,radius,dirsel)
{
	var subset = {};
	for (var k = 0; k < this.trees.length;k++)
	{
		var r;
		if (p._data == undefined)
			r = this.trees[k].findNearbyPoints([p[0],p[1],p[2]], radius, {includeData:true});
		else
			r = this.trees[k].findNearbyPoints([p._data[0],p._data[1],p._data[2]], radius, {includeData:true});
		
		var d = r.data;
		var len = d.length;
		if (dirsel == undefined)
		{
			for (var j=0;j < len;j++)
				subset[d[j][0]] = true;
		}
		else
		{
			var dir = dirsel._data;
			var thres = 0.9*math.sqrt(dir[0]*dir[0]+dir[1]*dir[1]+dir[2]*dir[2]);
			for (var j=0;j < len;j++)
			{
				if (math.abs(d[j][1]*dir[0]+d[j][2]*dir[1]+d[j][3]*dir[2]) > thres)
				   subset[d[j][0]] = true;
			}

		}

		
	}
	return Object.keys(subset);
}





function kunique(x)
{
	var obj = {};
	var len = x.length;
	for (var k = 0; k < len;k++)
		obj[x[k]] = true;
	return Object.keys(obj);

}

function kintersect(x,y)
{
	var obj = {};
	var res = [];
	var len = x.length;
	for (var k = 0; k < len;k++)
		obj[x[k]] = true;
	var len = y.length;
	for (var k = 0; k < len;k++)
	{
		if (obj[y[k]])
			res.push(y[k]);
	}
	return res;

}



function kunion(x,y)
{
	return [].concat(x).concat(y);

}



function kdiff(x,y)
{
	var obj = {};
	var res = [];
	var len = y.length;
	for (var k = 0; k < len;k++)
		obj[y[k]] = true;
	if (x.all)
	{
		for (var k = 0; k < x.all;k++)
		    if (!obj[k])
			   res.push(k);			
	}	
	else
	{
   	    var len = x.length;
		for (var k = 0; k < len;k++)
		{
			if (!obj[x[k]])
				res.push(x[k]);
		}
	}
	return res;

}

function importTCK(fileObject,uint8Response,processinfo,arrived)
{
	  
	  var view = new DataView(uint8Response.buffer);
	  var hdr = view.getUTF8String(0,1024);
	  var toks = hdr.split('\n');
	  if (toks[0].trim() == 'mrtrix tracks')
	  {
		 var header = {};
		 for (var k = 0; k < toks.length-1;k++)
		 {
			if (toks[k+1].search("^datatype:") >=0)
				header.datatype = toks[k+1].substring(9).trim();
			else if (toks[k+1].search("^count:") >=0)
				header.count = parseInt(toks[k+1].substring(7));
			else if (toks[k+1].search("^file:")>=0)
				header.offset = parseInt(toks[k+1].substring(7));
		 }

         if (header.count == 0 | header.count == undefined)
         {
         	arrived()
         	return;
         }

		 var LE = true;

		 var pos = 0;
		 var tot_points = 0;

		 var max = [-100000,-100000,-100000];
		 var min = [100000,100000,100000];

		 var tmax = [-100000,-100000,-100000];
		 var tmin = [100000,100000,100000];


		 var dummy = new Array(header.count);
		 var tract_buffer = new Float32Array((uint8Response.byteLength-header.offset-header.count*4)/4);

		 var tracts = [];
		 var tracts_max = new Float32Array(header.count*3);
		 var tracts_min = new Float32Array(header.count*3);

		 var tracts_len = new Float32Array(header.count);


		 var tractlen = 0;
		 var totlen = 0;
		 var tract_cnt = 0;

		 dummy.chunk(function(el,j,arr)
			{
				 var tract = [];
				 var pos = arr.pos;
				 if (pos == undefined) pos = 0;

				 while(true)
				 {
					var val = view.getFloat32(header.offset+4*pos,LE);
					//if (pos%3==0)
					//	val += 1700;
					if (max[pos%3] < val) max[pos%3] = val;
					if (min[pos%3] > val) min[pos%3] = val;
					if (tmax[pos%3] < val) tmax[pos%3] = val;
					if (tmin[pos%3] > val) tmin[pos%3] = val;

					if (!isNaN(val))
					{
						tract.push(val);
						pos++;
						tot_points++;
						tractlen++;
					}
					else
					{
						pos+=3;
						tracts_max[3*tract_cnt] =(tmax[0]);
						tracts_max[3*tract_cnt+1] =(tmax[1]);
						tracts_max[3*tract_cnt+2] =(tmax[2]);
						tracts_min[3*tract_cnt] =(tmin[0]);
						tracts_min[3*tract_cnt+1] =(tmin[1]);
						tracts_min[3*tract_cnt+2] =(tmin[2]);
						tmax = [-100000,-100000,-100000];
						tmin = [100000,100000,100000];						
						tracts_len[tract_cnt] = (tractlen/3);					
						tract_buffer.set(tract,totlen);
						var tmp = new Float32Array(tract_buffer.buffer,totlen*4,tractlen);
						tracts.push(tmp);

						totlen += tractlen;
						tract_cnt++;
					

						tractlen = 0;
					//	start = 0;
					//	tracts.push(new Float32Array(uint8Response.buffer,header.offset+4*(start),pos-start));
						break;
					}
				 }	
				 arr.pos = pos;

			},1024*4,0,
			function(i)
			{ 
			  processinfo("reading " + math.round(i/header.count*100) +"%");
			},
			function()
			{
			  if (tracts.length>0)
			  {
/*
				for (var k = 0; k < tracts.length; k++)
				{
					tracts[k] =  reparam_track_constPcnt(tracts[k],undefined,5);
					//tracts[k] = reparam_track(tracts[k],20 );
				}
*/


				fileObject.content = {tracts:tracts,   // these are just pointer on tract_buffer
									tract_buffer:tract_buffer,
									tracts_len:tracts_len,
									tot_points:tot_points,
									octree:new myOctree(min,max,0),
									tracts_max:tracts_max,tracts_min:tracts_min,
									min:min,max:max,
									buffer:uint8Response.buffer};
			  }
			   arrived(fileObject);

			});
	  }
}
/*
0 id_string[6]	char	6	ID string for track file. The first 5 characters must be "TRACK".
6 dim[3]	short int    	6	Dimension of the image volume.
12 voxel_size[3]	float	12	Voxel size of the image volume.
24 origin[3]	float	    12	Origin of the image volume. This field is not yet being used by TrackVis. That means the origin is always (0, 0, 0).
36 n_scalars	short int	2	Number of scalars saved at each track point (besides x, y and z coordinates).
38 scalar_name[10][20]	char	200	Name of each scalar. Can not be longer than 20 characters each. Can only store up to 10 names.
238 n_properties	short int	2	Number of properties saved at each track.
240 property_name[10][20]	char	200	Name of each property. Can not be longer than 20 characters each. Can only store up to 10 names.
440 vox_to_ras[4][4]	float	64	4x4 matrix for voxel to RAS (crs to xyz) transformation. If vox_to_ras[3][3] is 0, it means the matrix is not recorded. This field is added from version 2.
504 reserved[444]	char	444	Reserved space for future version.
948 voxel_order[4]	char	4	Storing order of the original image data. Explained here.
952 pad2[4]	char	4	Paddings.
956 image_orientation_patient[6]	float	24	Image orientation of the original image. As defined in the DICOM header.
980 pad1[2]	char	2	Paddings.
982 invert_x	unsigned char	1	Inversion/rotation flags used to generate this track file. For internal use only.
983 invert_y	unsigned char	1	As above.
984 invert_x	unsigned char	1	As above.
985 swap_xy	unsigned char	1	As above.
986 swap_yz	unsigned char	1	As above.
987 swap_zx	unsigned char	1	As above.
988 n_count	int	4	Number of tracks stored in this track file. 0 means the number was NOT stored.
992 version	int	4	Version number. Current version is 2.
hdr_size	int	4	Size of the header. Used to determine byte swap. Should be 1000.
*/
function importTRK(fileObject,uint8Response,processinfo,arrived)
{
	  
	  var view = new DataView(uint8Response.buffer);
	  if (ab2str(uint8Response.slice(0,5)) == "TRACK")
	  {
		 var header = {};

		 var LE = true;
		  header.offset = 1000;
		
          header.n_scalars = view.getUint16(36,LE);
          header.n_props = view.getUint16(238,LE);
          header.count = view.getInt32(988,LE);

          header.voxSize = view.getFloat32(12,LE);

		  var vox_to_ras = math.diag([0,0,0,0]);
		  for (var k = 0; k < 16;k++)
		  	    vox_to_ras._data[math.floor(k/4)][k%4] = view.getFloat32(440+k*4,LE);
		  var e = vox_to_ras._data;
		  if (e[3][3] == 0)
		  	e = undefined;

		  var ie = math.inv(vox_to_ras)._data;


		 var pos = 0;
		 var tot_points = 0;

		 var max = [-100000,-100000,-100000];
		 var min = [100000,100000,100000];

		 var tmax = [-100000,-100000,-100000];
		 var tmin = [100000,100000,100000];


		 var dummy = new Array(header.count);
		 var tract_buffer = new Float32Array((uint8Response.byteLength-header.offset-header.count*4)/4);

		 var tracts = [];
		 var tracts_max = new Float32Array(header.count*3);
		 var tracts_min = new Float32Array(header.count*3);

		 var tracts_len = new Float32Array(header.count);


		 var tractlen = 0;
		 var totlen = 0;
		 var tract_cnt = 0;

		 dummy.chunk(function(el,j,arr)
			{
				var tract = [];
				var pos = arr.pos;
				if (pos == undefined) pos = 1000;


				var num_p = view.getInt32(pos,LE); pos+=4;

				var c = [0,0,0];
				for (var k = 0; k < num_p;k++)
				{
					for (var j = 0; j < 3;j++)
					{
						c[j] =  (view.getFloat32(pos,LE))+1;
						pos += 4;
						tot_points++;
						tractlen++;

					}

					c[0]  = c[0] / header.voxSize;
					c[1]  = c[1] / header.voxSize;
					c[2]  = c[2] / header.voxSize;
					for (var j = 0; j < 3;j++)
					{
						var val;
						if (e)						 	
						 	val = (e[j][0]*c[0]+e[j][1]*c[1]+e[j][2]*c[2]+e[j][3]);
						else
					 		val = c[j];
					 	//if (j==0) val = -val;
						if (max[j] < val) max[j] = val;
						if (min[j] > val) min[j] = val;
						if (tmax[j] < val) tmax[j] = val;
						if (tmin[j] > val) tmin[j] = val;

						tract.push(val);
					}
				}


				tracts_max[3*tract_cnt] =(tmax[0]);
				tracts_max[3*tract_cnt+1] =(tmax[1]);
				tracts_max[3*tract_cnt+2] =(tmax[2]);
				tracts_min[3*tract_cnt] =(tmin[0]);
				tracts_min[3*tract_cnt+1] =(tmin[1]);
				tracts_min[3*tract_cnt+2] =(tmin[2]);
				tmax = [-100000,-100000,-100000];
				tmin = [100000,100000,100000];						
				tracts_len[tract_cnt] = (tractlen/3);					
				tract_buffer.set(tract,totlen);
				var tmp = new Float32Array(tract_buffer.buffer,totlen*4,tractlen);
				tracts.push(tmp);

				totlen += tractlen;
				tract_cnt++;					
				tractlen = 0;



				arr.pos = pos;

			},1024*4,0,
			function(i)
			{ 
			  processinfo("reading " + math.round(i/header.count*100) +"%");
			},
			function()
			{
			  if (tracts.length>0)
			  {

				fileObject.content = {tracts:tracts,   // these are just pointer on tract_buffer
									tract_buffer:tract_buffer,
									tracts_len:tracts_len,
									tot_points:tot_points,
									octree:new myOctree(min,max,0),
									tracts_max:tracts_max,tracts_min:tracts_min,
									min:min,max:max,
									buffer:uint8Response.buffer};
			  }
			   arrived(fileObject);

			});
	  }
}




function createFiberVisitMap(lines,subset,endpoints,fileObject,progress,done,persistent)
{
	if (progress)
		progress("rendering fiber visits");
  
	if (subset)
	  subset = subset.slice(0,subset.length)

	var worker;
	if (persistent && persistent.worker)
	{
		worker = persistent.worker;
		lines = undefined;
	}

 	worker = executeImageWorker({func:'createFiberVisitMap',
 	    lines:lines,subset:subset,
 	    endpoints:endpoints,
 		data:fileObject.content.data,
 		size:fileObject.content.sizes,
 		buffer:fileObject.buffer, keepOpen:true,

 		edges:math.inv(fileObject.content.edges)._data},
 	[	fileObject.buffer],
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
			fileObject.buffer = e.execObj.buffer;
			done();
		
 	 	},worker
 	 	);

 	return worker
 

}


KObject3DTool.packTractsForTransfer = function(tracts)
{
	function rmchnk(a)
	{
		return a;
	}

//	var tracts_data = tracts.content.tracts;
//	if (tracts_data != undefined)
//		tracts_data = tracts_data.slice(0);

	return {tract_buffer: tracts.content.tract_buffer, 
			tot_points:tracts.content.tot_points,
			tracts_len:tracts.content.tracts_len, 
			tracts_min:rmchnk(tracts.content.tracts_min),
			tracts_max:rmchnk(tracts.content.tracts_max),
			tracts:rmchnk(tracts.content.tracts),
			max:rmchnk(tracts.content.max),
			min:rmchnk(tracts.content.min)};
}

KObject3DTool.unpackTracts = function(tracts)
{
	if (tracts.tracts == undefined)
	{
		var tr = [];
		var offset = 0;
		var tot_points = 0;
		for (var k = 0; k < tracts.tracts_len.length;k++)
		{
			var tmp = new Float32Array(tracts.tract_buffer.buffer,offset*4,tracts.tracts_len[k]*3);
			tot_points += tracts.tracts_len[k]
			offset += 3*tracts.tracts_len[k];
			tr.push(tmp);
		}
		tracts.tot_points = tot_points;
		tracts.tracts = tr;
	}
}



KObject3DTool.useOctreeWorker = true;

function realtimeTracking(seeding,nii,params)
{
		var M = 256;
		var cosLUT = new Array(M)
		var sinLUT = new Array(M)
		for (var l = 0; l < M;l++)
		{
			cosLUT[l] = Math.cos(Math.PI*2*l/M);
			sinLUT[l] = Math.sin(Math.PI*2*l/M);
		}

		function cos(x)
		{
			return cosLUT[Math.floor(x*M)];
		}
		function sin(x)
		{
			return sinLUT[Math.floor(x*M)];
		}



		function minmax(x,max,min)
		{
			if (x[0] > max[0])
				max[0] =x[0];
			if (x[0] < min[0])
				min[0] =x[0];
			if (x[1] > max[1])
				max[1] =x[1];
			if (x[1] < min[1])
				min[1] =x[1];
			if (x[2] > max[2])
				max[2] =x[2];
			if (x[2] < min[2])
				min[2] =x[2];
		}


		function getSeed()
		{
			if (seeding.radius != undefined)
			{
				var p = seeding.seed._data;
				var r = seeding.radius;
				var delta = getDisplacement(1);
				var nor = seeding.radius*Math.pow(Math.random(),1/3)/Math.sqrt(delta[0]*delta[0] + delta[1]*delta[1] +delta[2]*delta[2]);			
				return  [p[0] +delta[0]*nor ,p[1] +delta[1]*nor ,p[2] +delta[2]*nor ];
			}
			else if (seeding.threshold != undefined)
			{
				/*
				var r = Math.floor(Math.random()*seedvoxels.length);
				var p = seedvoxels[r]
				return math.multiply(nii.edges,[p[0]+Math.random(),p[1]+Math.random(),p[2]+Math.random(),1])._data;
				*/

				var seednii = seeding.vol;
				var sz = seednii.sizes;
				var totsz = sz[0]*sz[1]*sz[2];
				var best = -100000;
				var best_idx = -1
				for (var k = 0; k < 500;k++)
				{
					var x = Math.floor(Math.random()*sz[0]);
					var y = Math.floor(Math.random()*sz[1]);
					var z = Math.floor(Math.random()*sz[2]);
					var mag;
					if (sz[3] == 3)
					{
						var d   = [Math.abs(seednii.data[sz[0] * sz[1] * z + sz[0] * y + x]),
								  Math.abs(seednii.data[sz[0] * sz[1] * z + sz[0] * y + x +totsz]),
								  Math.abs(seednii.data[sz[0] * sz[1] * z + sz[0] * y + x +2*totsz])];
						mag = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
					}
					else
					{
						mag = (seednii.data[sz[0] * sz[1] * z + sz[0] * y + x]);

					}
					if (mag > seeding.threshold)					
						return math.multiply(seednii.edges,[x+Math.random(),y+Math.random(),z+Math.random(),1])._data;						
					if (mag > best)
					{
						best = mag;
						best_idx = [x,y,z];
					}
				}
			    return false;
			    //return math.multiply(seednii.edges,[best_idx[0]+Math.random(),best_idx[1]+Math.random(),best_idx[2]+Math.random(),1])._data;						


			}
			else
			{

				var r = Math.floor(Math.random()*seedvoxels.length);
				var p = seedvoxels[r]
				return math.multiply(seeding.roi.content.edges,[p[0]+Math.random(),p[1]+Math.random(),p[2]+Math.random(),1])._data;

			}
		}






	    var maxlen = params.Maxlen;
	    var minlen = params.Minlen;
	    var dens = params.Density;
		var stepwidth = params.Stepwidth;
		
		var thres =params.Threshold;	
		if (seeding.threshold_term != undefined && params.Threshold == 0)
			thres = seeding.threshold_term;
	
		var jitter_stength = params.Jitter;
		var ang_thres = params.AngularThreshold;
		var ang_thres_ = Math.cos(ang_thres/180*Math.PI);
		var smooth_dist = params.SmoothWidth;					
		var seedvoxels = [];

	    var numfibs;
		if (seeding.radius != undefined)
		{
	   		 numfibs = Math.floor(dens * Math.sqrt(4/3*Math.PI * Math.pow(seeding.radius,3)));
		}
		else if (seeding.threshold != undefined)
		{
			/*var edges = nii.edges;
			var sz = nii.sizes;
			if (seeding.seedvoxels == undefined)
			{
				var totsz = sz[0]*sz[1]*sz[2];
				for (var z = 0; z < sz[2]; z++)
					for (var y = 0; y < sz[1]; y++)
						for (var x = 0; x < sz[0]; x++)
						{
							var d   = [Math.abs(nii.data[sz[0] * sz[1] * z + sz[0] * y + x]),
							          Math.abs(nii.data[sz[0] * sz[1] * z + sz[0] * y + x +totsz]),
							          Math.abs(nii.data[sz[0] * sz[1] * z + sz[0] * y + x +2*totsz])];
							var mag = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
							if (mag > seeding.threshold)
								seedvoxels.push([x, y, z]);

						}
				seeding.seedvoxels = seedvoxels;
			}
			else
				seedvoxels = seeding.seedvoxels;*/
			numfibs = seeding.numfibs;
		}
		else
		{

			var roi = seeding.roi;

			var edges = roi.content.edges;
			var sz = roi.content.sizes;
			for (var z = 0; z < sz[2]; z++)
				for (var y = 0; y < sz[1]; y++)
					for (var x = 0; x < sz[0]; x++)
						if (roi.content.data[sz[0] * sz[1] * z + sz[0] * y + x] > 0.5)
							seedvoxels.push([x, y, z]);
			numfibs = dens*seedvoxels.length/10;

			
		}


		var totsz = nii.sizes[2]*nii.sizes[1]*nii.sizes[0]

		var tracts = [];
		var tracts_min = [];
		var tracts_max = [];
		var tracts_len = [];
		var tot_points = 0;
		var bb_max = [-100000,-100000,-100000];
		var bb_min = [100000,100000,100000];

		var ie = math.inv(nii.edges)._data;
		var e = math.multiply(nii.edges,math.diag([1/nii.voxSize[0],1/nii.voxSize[1],1/nii.voxSize[2],1]))._data;


        if (typeof nii.descrip == "string" && nii.descrip.substring(0,6).toLowerCase() == "mrtrix")
        {
            e = math.diag([1,1,1,1])._data;
        }



		var numdirs = nii.sizes[3]/3;




		var getNextDir;

	    if (numdirs > 1)
	    {
	  
			getNextDir = function(p,last_d)
			{		
				var best = undefined;
				var maxp = -1;
				for (var i = 0 ; i < numdirs;i++)
				{
					var d =  NNInterp3_n(nii, p[0], p[1], p[2], ie,nii.widheidep,nii.widheidep*3*i,3); 
					if (d == undefined)
					{
						best = undefined;
						break;
					}
					var dn = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
					var proj = (last_d[0]*d[0]+last_d[1]*d[1]+last_d[2]*d[2])/dn;						
					if (Math.abs(proj) > maxp )
					{
						best = [d,dn,proj];
						maxp = Math.abs(proj);
					}

				}
				return best;
			}


	    }
	    else
	    {
	    	
			getNextDir = function(p,last_d)
			{		
				var best = undefined;
				var d = NNInterp3_n(nii, p[0], p[1], p[2], ie,nii.widheidep,0,3); 

				if (d == undefined)
					return;
				var dn = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
				var proj = (last_d[0]*d[0]+last_d[1]*d[1]+last_d[2]*d[2])/dn;						
				return [d,dn,proj];
			}
/*
			getNextDir = function(p,last_d)
			{		
				var best = undefined;
				var d = NNInterp3_n(nii, p[0], p[1], p[2], ie,nii.widheidep,0,3); 

				if (d == undefined)
					return;
				var proj = (last_d[0]*d[0]+last_d[1]*d[1]+last_d[2]*d[2]);
                for (var k = 0; k < 3;k++)
				    d[k] = last_d[k] + 0.00001*d[k]*proj;
				var dn = Math.sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
				var proj = (last_d[0]*d[0]+last_d[1]*d[1]+last_d[2]*d[2])/dn;							    
				return [d,dn,proj];
			}
*/

	    }

		//console.log('start where mag>' + seeding.threshold + "   stop when mag<" + thres);

		var previous_seed;
		var max_tries = numfibs*10;
		var tries = 0;

		for (var j = 0; j < numfibs; j++)
		{
			var tract = [];

			var num = 0;
			var p,last_d,min,max;

			for (var s = 0; s < 2; s++)
			{
				if (s == 0)
				{
				   p = getSeed();
				   if ( p==false)
				   	 break;
				   last_d = getDisplacement(1)
				   previous_seed = {p:p.slice(0),last_d:last_d.slice(0)};

				   min = [p[0],p[1],p[2]]
				   max = [p[0],p[1],p[2]]
				   tract.push(p[0],p[1],p[2]);

				}
				else
				{
				   p = previous_seed.p;
				   last_d = [-previous_seed.last_d[0],-previous_seed.last_d[1],-previous_seed.last_d[2]];
				}

				if (p == false)
					continue;



				var sm_acc = [];
				var smoother = [0,0,0];
				var sm_acc = [];


				for (var k = 0; k < maxlen; k++)
				{
					var best =  getNextDir(p,last_d);

					if (best != undefined)				
					{
						var jitter = getDisplacement(jitter_stength);
						var d = best[0];
						var dn = best[1];
						var proj = best[2];
						if (dn < thres ||  Math.abs(proj) < ang_thres_)
							break;
						var d_w = [ e[0][0]*d[0] + e[0][1]*d[1] + e[0][2]*d[2] ,
									e[1][0]*d[0] + e[1][1]*d[1] + e[1][2]*d[2] ,
									e[2][0]*d[0] + e[2][1]*d[1] + e[2][2]*d[2] ];
						var sg = Math.sign(proj);
						var alpha = stepwidth*sg/Math.sqrt(d_w[0]*d_w[0]+d_w[1]*d_w[1]+d_w[2]*d_w[2]);
						p[0] += alpha*d_w[0] + jitter[0];
						p[1] += alpha*d_w[1] + jitter[1];
						p[2] += alpha*d_w[2] + jitter[2];				
						last_d = [sg*d[0]/dn,sg*d[1]/dn,sg*d[2]/dn];
					}
					else
						break;

					if (smooth_dist > 1)
					{
						if (k < smooth_dist)
						{
							smoother[0] += p[0];
							smoother[1] += p[1];
							smoother[2] += p[2];
						}
						else
						{
							var x = [smoother[0]/smooth_dist,smoother[1]/smooth_dist,smoother[2]/smooth_dist];

							if (s == 0)
								tract.push(x[0],x[1],x[2]);
							else
								tract.unshift(x[0],x[1],x[2]);

							minmax(x,max,min);

							var idx = (k)%smooth_dist;
							smoother[0] += p[0] - sm_acc[idx][0];
							smoother[1] += p[1] - sm_acc[idx][1];
							smoother[2] += p[2] - sm_acc[idx][2];
						}
						sm_acc[k%smooth_dist] = p.slice(0);
						
					}
					else
					{
						if (s == 0)
							tract.push(p[0],p[1],p[2]);
						else
							tract.unshift(p[0],p[1],p[2]);

					}

				}


			}
			if (tract.length/3 > minlen)
			{
				tracts.push(new Float32Array(tract));
				tracts_min.push(min[0],min[1],min[2]);
				tracts_max.push(max[0],max[1],max[2]);
				tracts_len.push(tract.length/3);
				minmax(min,bb_max,bb_min);
				minmax(max,bb_max,bb_min);
				tot_points += tract.length/3;

			}
			else
			{
				if (tries++ > max_tries)
					break;
			 	j--;
			}
		}

		return {tracts:tracts,tot_points:tot_points,tracts_len:tracts_len,tracts_min:tracts_min,tracts_max:tracts_max,min:bb_min,max:bb_max};





	function getDisplacement(fac)
	{
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

		var x = h*cos(u1);
		var y = h*sin(u1);
		
		var u1 = Math.random();
		var u2 = Math.random();
		var h = Math.sqrt(-2*Math.log(u2))

		var z = h*cos(u1);

		return [fac*x,fac*y,fac*z];

		
	}


}




function KTrackingPanel(tck)
{

    var panel = KPanel($(document.body),"someid","Tracking panel");
    panel.closeOnCloseAll = true
	var $container = panel.$container;
	$container.addClass("DBSpanel");
	panel.$container.width(400);

    var $fileRow = $("<div ></div>").appendTo(panel.$container);
    var $fileRow2 = $("<div class='panel'></div>").appendTo(panel.$container);


	$fileRow.append($("<hr>")).append($("<i class='flexspacer'></i>"));

	var params = {};
	panel.params = params;
	var params_ = {};
	panel.params_ = params_;

	function inputParam(name,defaultval,unit,$div)
	{
		if (unit == undefined)
			unit = "";
		else
			unit = "("+unit+")";

		if ($div == undefined)
			$div = $fileRow2;

		var $param = $("<span class='DBS_paramname'> "+name+" </span> <input class='DBS_paraminput'  min=0 step=1 type='number' value='"+defaultval+"'> "+unit+"<br>")
		$div.append($param).append($("<i class='flexspacer'></i>"));
		params[name] = defaultval;
		params_[name] = $param;
		$($param[2]).on("change",function(){
			params[name] = parseFloat($(this).val());			
		});
	}

	function update()
	{
		for (var k in params)
			$(params_[k]).val(params[k]);
	}
	panel.update = update;



	inputParam("Density",10,"#walker");
	inputParam("Maxlen",250);
	inputParam("Minlen",70);
	inputParam("Stepwidth",0.5);
	inputParam("Threshold",0);
	inputParam("AngularThreshold",75,"deg");
	inputParam("Jitter",0.1);
	inputParam("SmoothWidth",10);
	inputParam("numChunks",25);
	inputParam("climcon",0, "0-bgnd,1-tensor");




	$fileRow2.append($("<hr>"))

	return panel;
}



function KNiceFibPanel()
{


	if (KPanel.currentPanels["nicefibs"] != undefined)
		return KPanel.currentPanels["nicefibs"];


    var panel = KPanel($(document.body),"nicefibs","Nice Fibers");
    panel.closeOnCloseAll = true
	var $container = panel.$container;
	panel.$container.width(400);

    var $fileRow = $("<div ></div>").appendTo(panel.$container);
    var $fileRow2 = $("<div class='panel'></div>").appendTo(panel.$container);


	$fileRow.append($("<hr>")).append($("<i class='flexspacer'></i>"));

	var params = {};
	panel.params = params;
	var params_ = {};
	panel.params_ = params_;

	function inputParam(name,defaultval,unit,$div)
	{
		if (unit == undefined)
			unit = "";
		else
			unit = "("+unit+")";

		if ($div == undefined)
			$div = $fileRow2;

		var $param = $("<span class='DBS_paramname'> "+name+" </span> <input class='DBS_paraminput'  min=0 step=1 type='number' value='"+defaultval+"'> "+unit+"<br>")
		$div.append($param).append($("<i class='flexspacer'></i>"));
		params[name] = defaultval;
		params_[name] = $param;
		$($param[2]).on("change",function(){
			params[name] = parseFloat($(this).val());			
		});
	}

	function update()
	{
		for (var k in params)
			$(params_[k]).val(params[k]);
	}
	panel.update = update;



	inputParam("Radius",0.5,"mm");
	inputParam("SpecularPower",3,"pow");
	inputParam("Tessellation",5,"#");
	inputParam("Simplification",5,"0-100");


    var $update = $("<a style='width:80px;' class='KViewPort_tool'> Update </a>").click(
		function(e)
		{
			for (var k = 0; k < panel.currentlyNice.length;k++  )
				panel.currentlyNice[k].showNiceFibs();

		}
    )
    $fileRow2.append($update)


	panel.currentlyNice = [];

	panel.hide();

	$fileRow2.append($("<hr>"))

	return panel;
}



function track_length(track)
{
	var d = 0;
 	var cnt = track.length/3;
	for (var k = 0; k < cnt-1;k++)
	{
		d += Math.sqrt(
			 (track[3*k]-track[3*k+3])*(track[3*k]-track[3*k+3]) +
			 (track[3*k+1]-track[3*k+4])*(track[3*k+1]-track[3*k+4]) +
			 (track[3*k+2]-track[3*k+5])*(track[3*k+2]-track[3*k+5]) );
	}
	return d;
}

function reparam_track_constPcnt(track,len,pc)
{
	if (len == undefined)
		len = track_length(track);
	return reparam_track(track,(len/(pc-1))+0.1);
}

function reparam_track(track,len)
{
		var pcnt = track.length/3;
		var Leng = 0;

		var dtau = 0;
		var cur_p = 1;
		var cur_i = 1;
		var dR,normdR;
		var new_track = [track[0],track[1],track[2]];
		for (;;)
		{
			while (dtau <= len && cur_p < pcnt)
			{
				dR  = [track[cur_p*3]- track[cur_p*3 -3],track[cur_p*3+1]- track[cur_p*3 -2],track[cur_p*3+2]- track[cur_p*3 -1]];
				normdR = Math.sqrt(dR[0]*dR[0] + dR[1]*dR[1] + dR[2]*dR[2]);
				dtau += normdR;
                Leng += normdR;
				cur_p++;
			}

			if (dtau >= len)
			{
				new_track.push(track[cur_p*3 -3] - dR[0] *( (dtau-len)/normdR ),
				  			   track[cur_p*3 -2] - dR[1] *( (dtau-len)/normdR ),
							   track[cur_p*3 -1] - dR[2] *( (dtau-len)/normdR ) );
			}
			else
			{
				new_track.push(track[3*pcnt-3 ],
								track[3*pcnt -2 ],
								track[3*pcnt- 1 ]);
				break;
			}

			dtau = dtau-len;

			cur_i++;
			if (cur_i >= 10000)
			{
				console.log("bugy");
				break;
			}			

		}

		return new_track;


}


function createFibTrackWorker(trackVol)
{
	function packNiiForTransfer(nii)
	{
		return {data:nii.data,
		edges:nii.edges,descrip:nii.descrip,sizes:nii.sizes,voxSize:nii.voxSize,widheidep:nii.widheidep,wid:nii.wid,widhei:nii.widhei};
	}


    var scriptname = 'KFibtrackWorker.js' + '?' +  static_info.softwareversion;;
    if (typeof url_pref != "undefined")
       scriptname = url_pref + scriptname;

	var worker =  new Worker(scriptname);
	worker.postMessage = worker.webkitPostMessage || worker.postMessage;
	worker.addEventListener('message', function(e) {
		e = e.data;
		if (e.msg == 'tracts')
		{
			worker.callback(e.result);
		}
		worker.istracking = false;
	}, false);
	worker.kill = function()
	{
		worker.postMessage({message:'kill'},[]);

	}								
	worker.postMessage({message:'trackvol',nii:packNiiForTransfer(trackVol)},		[]);

	worker.track = function (seeding,params,callback)
	{
		worker.istracking = true;
		if (seeding.vol)
		{
			if (this.lastSeedingVol == seeding.vol)
				seeding.vol = 'last'
			else
				seeding.vol = packNiiForTransfer(seeding.vol);
		}
		this.callback = callback;
		this.postMessage({message:'start',seeding:seeding,params:params },[]);
	}

	return worker;
}