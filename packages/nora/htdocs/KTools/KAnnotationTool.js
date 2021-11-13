





function KMarkerTool(master,toolname)
{
  /** Drawing annotations 
	 * @class 
	 * @alias KAnnotationTool
	 * @augments KToolWindow
	 */   
  var that = new KToolWindow(master,
  $("<div class='KView_tool '><i class='fa fa-comment-o fa-1x'></i></div>")
  .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Markers</li>") ))
  );
 
  that.name = toolname;
	
	if( markerProxy == undefined)
    	markerProxy = new KMarkerProxy();
  
  // choose the default markerPanel
//  var markerPanel = KMarkerPanel();


  function createMarkerSet(type, name)
  {
//  		if(name==undefined)
//  		///
//			alertify.prompt("Name of marker set:", function(e,str) { if (e)   that.newSet(str,type); }, 'untitled');
//		else
			return that.newSet("undefined " + type,type);
  }
  that.createMarkerSet = createMarkerSet;

  var $menu = $("<ul ></ul>");
  $("<li><a>pointset</a></li>").click(function() { createMarkerSet('pointset') } ).appendTo($menu);
  $("<li><a>freeline</a></li>").click(function() { createMarkerSet('freeline') } ).appendTo($menu);
  $("<li><a>surface</a></li>").click(function() { createMarkerSet('surface') } ).appendTo($menu);

  $("<li><a>electrode</a></li>").click(function() { createMarkerSet('electrode') } ).appendTo($menu);
  $("<li><a>pointROI</a></li>").click(function() { createMarkerSet('pointROI') } ).appendTo($menu);
  $("<li><a>rectangles</a></li>").click(function() { createMarkerSet('rectangles') } ).appendTo($menu);

  that.$topRow.append( $("<li class='menu_generic_labelname'><a>MarkerTool</a></li>").append($menu) );
  that.$topRow.append( $("<li><a><i class='fa fa-plus'></i>New</a></li>").append($menu) );



  //that.$topRow.append(  $("<li><a><i class='fa fa-plus'></i> New markerset</a></li>").click(function(){ alertify.prompt("Name of marker set:", function(e,str) { if (e)   that.newSet(str); }); }  ) );
  that.$topRow.append(  $("<li><a><i class='fa fa-save'></i> Save</a></li>").click(function(){ 


      var finfo = patientTableMirror.getCurrentUniquePSID()
      if (finfo == false)
          alertify.error('Please select a unique patient for saving')
      else
      {
      	  var strr = "subject " + finfo.patients_id
      	  if (finfo.studies_id != undefined)
      	      strr = "study " + finfo.patients_id + finfo.studies_id 

		  alertify.prompt({msg:'Name of marker collection for '+strr+':',opt:finfo.potential_studies, optMsg:"Study to save"},				  
			  function(e,val)
					{ 
					   if (e) { 
						if (val.option != undefined)
						{
							markerProxy.save(val.str,undefined,{piz:finfo.patients_id, study:"#"+val.option}); 
							KViewer.markerTool.lastMarkerCollName = val.str; 

						}
						else
						{                    
							markerProxy.save(val); 
							KViewer.markerTool.lastMarkerCollName = val; 
						}
					  }

					},KViewer.markerTool.lastMarkerCollName);  
      }
   }  ) );
      					
   that.$topRow.append(  $("<li><a><i class='fa fa-trash'></i> Clear</a></li>").click(function(){ 
		  function clear() {
		  		markerProxy.delAll(); 
		  		that.update();
		  		};
		  if (markerProxy.modified)
			alertify.confirm("Delete all modifcations on current annotations?",function(e) { if (e) { clear();} })
		  else 
			clear();
			 }	));
 


	var btns = that.btns = {};

	var $toolsRow    = $("<div class='anno_panel_tools'></div>").appendTo(that.$container);
   	$toolsRow.append($("<i class='flexspacer'></i>"));
	
	btns.$showall = $("<i class='KViewPort_tool fa fa-refresh'></i>").appendTooltip('show all markers').click(showAll ).appendTo($toolsRow);
	btns.$locked = $("<i class='KViewPort_tool fa fa-lock'></i>").appendTooltip('lockmarkers').click( function(){ 

		var dest = !markerProxy.currentSet.state.locked;
		for (var s in markerProxy.markersets)
			 markerProxy.markersets[s].toggleStateVar('locked',dest);


	} ).appendTo($toolsRow);
	btns.$createonclick = $("<i class='KViewPort_tool fa fa-pencil'></i>").appendTooltip('markercreateonclick').click( function(){ markerProxy.currentSet.toggleStateVar('createonclick')} ).appendTo($toolsRow);
	btns.$cyclecolors = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-recycle'></i>").appendTooltip('cyclecolors').click( function(){ markerProxy.currentSet.toggleStateVar('cyclecolors') } ).appendTo($toolsRow);
	btns.$hoverdetails = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-info'></i>").click( function(){ markerProxy.currentSet.toggleStateVar('hoverdetails')} ).appendTooltip('markerdetailsonhover').appendTo($toolsRow);


	function showAll()
	{
		markerProxy.showAll();
	}



	var markersets =  markerProxy.markersets;

	that.newSet = function(name,type)
	{
		var opts = {name:name, 
				type:type,
				showPanel: false,
				hideOtherPanels: true
				}
		var mset = markerProxy.newSet( opts );
		that.update();
		return mset;

	}



	// here is the list of annotations
	var $annotationListDIV = $("<div class='annotation_tool_listDIV'></div>").appendTo(that.$container);
	that.resize = function(hei)
	{
		that.$container.height(hei);
		$annotationListDIV.height(hei-that.$container.find('.KToolsTopMenu').height());
	}

  that.update = function()
  {
  	$annotationListDIV.children().remove();
  	var ks = Object.keys(markersets).reverse()
	for (var i=0;i< ks.length;i++)
	{
	   var k = ks[i];
	   //setTimeout(function(k) { return function() {
	   var $setrow = $("<div  id='markerset_uuid_"+ markersets[k].uuid + "' class='markerset_row'></div>")
	   var $titlerow = $("<div></div>").appendTo($setrow);
	   var $name = $("<span>" + markersets[k].name + "</span>").appendTo($titlerow);
	
	   if (markerProxy.currentSet != undefined && k == markerProxy.currentSet.uuid)
	   	  $titlerow.addClass("markerset_row_active")

	   makeEditableOnDoubleClick($name);  
	   $name.on("keyup",function(k) { return function(){
	   	  markersets[k].name = $(this).text();
	   	  if(markersets[k].markerPanel)
	   	  	markersets[k].markerPanel.updateName();
	   } }(k));   

	   $titlerow.append( $("<i class='fa fa-trash'></i> ").click(function(k) { return function() {markerProxy.delSet(k); that.update()}}(k)) )
	   $titlerow.append( $("<i class='fa fa-eye'></i> ").click(function(k) {
	   	 return function(ev) {
	   	 	var $vis = $(this);
	   	 	if (markersets[k].togglePointsVisibility())
				$vis.addClass("fa-eye").removeClass("fa-eye-slash");
			else
				$vis.removeClass("fa-eye").addClass("fa-eye-slash");
				ev.stopPropagation(); return false}}(k)) )

	   $titlerow.append( $("<i class='fa fa-dot-circle-o'></i> ").click(function(k) { return function() {
              var set = markersets[k];
		   	  if (set.pickpanel == undefined)
				set.pickpanel = KPickingPanel(set);
			  else
			  	set.pickpanel.toggle();
	   	
	   }}(k)) )
	   

	   $titlerow.append( $("<i class='fa fa-copy'></i> ").click(function(k) { return function() {
				   	
			var set = createMarkerSet( 	markerProxy.markersets[k].type,	markerProxy.markersets[k].name+"(copy)");
			var pts = markerProxy.markersets[k].getPoints();
			for (var j = 0; j < pts.length;j++)
			{
				var c = pts[j].p.coords;
				var p = set.addpoint([c[0],c[1],c[2],c[3]]);
				p.setsize(pts[j].p.size)

			}
			that.update();
	


	   }

	   	}(k)) )
	   $titlerow.append( $("<i class='fa fa-save'></i> ").click(function(k) { return function() {markerProxy.save(undefined,k); that.update()}}(k)) )
	   if (markersets[k].type != 'electrode')
	   	  $titlerow.append( $("<i class='fa fa-plus'></i> ").click(function(k) { return function() {markerProxy.createMarker(undefined, markersets[k] );  
	   	  markerProxy.setCurrentSet(k, true); that.update()}}(k)) )
	   if (markersets[k].type == 'electrode')
	   	  $titlerow.append( $("<i class='fa fa-mars-stroke-v'></i> ").click(function(k) { return function() {markerProxy.markersets[k].Rectifytransform();}}(k)) )
	   if (markersets[k].type == 'pointset')
	   {
	   	  $titlerow.append( $("<i class='fa fa-cube'></i> ").appendTooltip("defineMCPsystem").click(function(k) { return function() {markerProxy.markersets[k].MCPtransform();}}(k)) )
	   	  $titlerow.append( $("<i class='fa fa-cubes'></i> ").appendTooltip("defineRECTsystem").click(function(k) { return function() {markerProxy.markersets[k].RECTtransform();}}(k)) )
	   }

		var colors = KColorSelectorSimple('getcolors');

 		var $colselector = KColorSelector(colors,
        function(c) {
        	if (c.getCSS)
            	return "background:" + c.getCSS() +"";
        },
        function(k) { return function(col,colidx) {
        	var x =  markerProxy.markersets[k];
        	for (var j in x.markerpoints)
        	{
        		x.markerpoints[j].setcolor(col);
        	}
        	x.updateLine()
          
        }}(k),markerProxy.markersets[k]);

/*	  
	  var $colorselector = KColorSelectorSimple($("<div class='markerpointrow_colorselector'></div>"), function() { 
		markersets[k];
	  }, {color:1});
*/
	  $titlerow.append($colselector);
	  $colselector.addClass("markerset_colselector");


	   $titlerow.append( $("<i class='fa fa-building-o'></i> ").click(function(k) { 
	   return function() {markersets[k].showPanel() }}(k)) )

	   var $typecombo = $("<select> <option value='pointset'> point set </option>" + 
	   							  " <option value='freeline'> free line </option>" + 
	   							  " <option value='surface'> surface </option>" + 
	   							  " <option value='electrode'> electrode </option> " + 
	   							  " <option value='pointROI'> pointROI </option> " + 
	   							  " <option value='rectangles'> rectangles </option> " + 
	   							  "</select>").appendTo($titlerow).
	   				on('change',function(k) { return function(e)
	   				{
	   					markersets[k].setType(e.target.value);
  					    that.update();

	   				}}(k));
       $typecombo.val( markersets[k].type);	   				



	   var $setinfo;
	   if (markersets[k].type == 'freeline' || markersets[k].type == 'surface' )
	   {
	   	   $setinfo = $("<div class='annotation_info'> ???: </div>").appendTo($setrow);
		   markersets[k].setInfo = function(text)
		   {
				$setinfo.text(text);
		   }
		   markersets[k].computeInfo();
	   }
	   else if (markersets[k].type == 'electrode')
	   {
		   $setinfo = $("<div class='annotation_info'> </div>").appendTo($setrow);


		   var elecs = Object.keys(electrodes);
		   var str = "";
		   for (var j = 0; j < elecs.length;j++)
		   	str += "<option value='"+elecs[j]+"'> "+elecs[j]+" </option>";
		   var $combo = $("<select> "+str +"</select>").appendTo($setinfo).
	   				click(function(set) { return function(e)
	   				{
	   					markerProxy.updateElectrode(set,e.target.value);
	   					if (set.markerPanel)
	   						set.markerPanel.update();
	   					KViewer.markerTool.update();
	   					set.pointChanged();
	   				}}(markersets[k]));
   		   $combo.val( markersets[k].elecmodel);	   					   				
   		   markersets[k].$elecmodel_combo = $combo;


		   var $ohm = $("<span>current (mA): </span>").appendTo($setinfo);
		   $ohm.append($("<input> ").val(markersets[k].electrode_properties.impedance).on("change",function(set) { return function(e)
		   {
		   		set.electrode_properties.impedance = parseFloat(e.target.value);
		   		set.electrode_properties.impedance = parseFloat(e.target.value);
		   }  }(markersets[k]) ));


		   var $simpanel = $("<button> Simulation Panel </button>").appendTo($setinfo).click(function(set) { return function(e)
		   {
		   	  if (set.simpanel == undefined)
			  	set.simpanel = KSimulationPanel(set);
			  else
			  	set.simpanel.toggle();
		   }  }(markersets[k]) );




		   $("<br>").appendTo($setinfo);
	   }


	   $annotationListDIV.append($setrow);
	   
	   //markersets[k].markerPanel.$annotationListDIV = $annotationListDIV;
	   //markersets[k].$titlerow = $titlerow;

	   $titlerow.click(function(k,$name,$titlerow) { return function() {
	   		setTimeout(function(){ 
	   		 	if ($name.attr("contentEditable"))
	   		 		return;
	   		 	else
	   		 	{
	   				markerProxy.setCurrentSet(k, true);  
	   		
	   		 	}
	   				},0);  } }(k,$name,$titlerow));

	   var ps = markersets[k].getPoints();


		// these are the things to show in the markerTool rows
		var thingstoshow;
		if (markersets[k].type == 'electrode')
		{
			thingstoshow = {economy:1, colorsel:1, id:1, name:1, toggle:0, search:1,  coords:1};
		}
		else if (markersets[k].type == 'freeline')
		{
			thingstoshow = {economy:1, colorsel:0, name:0,id:1, delete:1,search:1,  coords:1};
		}
		else if (markersets[k].type == 'surface')
		{
			thingstoshow = {economy:1, colorsel:0, name:0,id:1, delete:1,search:1,  coords:1};
		}
		else
		{
			thingstoshow = {colorsel:1, id:1, name:1, toggle:1, search:1, delete:1,  coords:1,coords_transformed:1};
		}


  	   for (var j=0;j< ps.length;j++)
  	   {
  			var p = ps[j];
  			if (markersets[k].type == 'electrode')
  			{
				thingstoshow.active = (j>=2);
				thingstoshow.radius = (j>=2);
  			}
  			var $div = p.createMarkerRepresentation("tool", thingstoshow );
		    $setrow.append($div )
		    if (markersets[k].type == 'pointset')
		      $div.append($("<hr width='100%'> "))	  			
  	   }
 	//  } }(k) ,0);
  	}
  }

  that.customToggle = function(enabled)
  {
  	 var mset = markerProxy.currentSet;
	 enabled = enabled | (mset != undefined && mset.markerPanel && mset.markerPanel.panelvisible);
  	 if (mset != undefined)
  	 {
		 if (enabled)
			mset.drawAllPoints();
  	 }

  	 if (!enabled)
  	     markerProxy.hideAll()
  }

  that.$container.on("dragover",function(ev){ ev.preventDefault() });
  $annotationListDIV.on("drop",function(e)
  {
    var params = getloadParamsFromDrop(e.originalEvent,undefined);
  	if (params.length > 0)
  	{
		params[0].progressSpinner = that.progressSpinner;
		params[0].callback = function(fileObject)
		{        
		  that.hideSpinner();
		  if ((fileObject.fileinfo.tag && fileObject.fileinfo.tag.search("ANO") >= 0) | 
		      (fileObject.fileinfo.Tag && fileObject.fileinfo.Tag.search("ANO") >= 0) | 
		      fileObject.filename.search("\\.ano.json") != -1 )
            markerProxy.loadAnnotations(fileObject);
		}

		KViewer.dataManager.loadData(params[0]);

  	}
  });



  return that;
 

}


// ======================================================================================
// ======================================================================================
// ============= markerProxy
// ======================================================================================
// ======================================================================================
KMarkerProxy = function()
{
	var that = new Object();
	
	/******************************************************************************
	  markerSets is key valued list
	*******************************************************************************/
	//var markersets = that.markersets = [];
	var markersets = that.markersets = {};
	var markersetIDs = that.markersetIDs = [];

	that.modified = false;


    function to_transformed(c)
	  {
		return math.multiply((KViewer.reorientationMatrix.matrix),  c  )
	  }
	  that.to_transformed = to_transformed;

	/******************************************************************************
	  updateElectrode
	*******************************************************************************/
	that.updateElectrode = function(set,model)
	{
		   while (Object.keys(set.markerpoints).length > 2)
		   {
		   		var ps = Object.keys(set.markerpoints);
		   		var key = ps[ps.length-1];
		   		set.markerpoints[key].deletepoint();		   		
		   		delete set.markerpoints[key];
		   }

		   if (Object.keys(set.markerpoints).length < 2)
		   {
				var point = set.addpoint(); 
				point.movepoint([0,0,80,1])
				var point2 = set.addpoint();
				point2.movepoint([0,0,-10,1])
		   }

		   var ps = set.getPoints();
		   var end = ps[0];
		   var tip = ps[1];
		   end.p.name = "end";
		   end.setsize(1);
		   end.visible = true;
		   end.setcolor(new KColor([155,0,0,20]));
   		   end.isElectrodeEnd = tip;
		   tip.p.name = "tip";
		   tip.setsize(1);
		   tip.visible = true;
		   tip.setcolor(new KColor([155,0,0,20]));



			set.color = 10;
		   set.electrode_properties = $.extend(true,{},electrodes[model]);
		   set.electrode_properties.impedance = 1000;
		   set.elecmodel = model;

		   var contacts = set.electrode_properties.contacts;
		   var cnt = 1;
		   while (Object.keys(set.markerpoints).length < contacts.length+2)
		   {
				var point = set.addpoint();
				point.p.name = "contact " + cnt ;
				point.setsize(1);
				point.visible = true;
				for (x in point.glmesh)
					point.glmesh[x].isPickable = false;
				point.pickable = false;
				point.isContact = true;
				point.setcolor(new KColor([50,50,50,0]));
				cnt++;
		   }
		   var ps = set.getPoints();
		   for (var j = 0; j < ps.length;j++)
			 ps[j].active = false;
		   ps[2].active = true;


		   set.pointChanged();
		   set.drawLine();
	}



	/******************************************************************************
	  delAll
	*******************************************************************************/
	that.delAll = function(force)
	{
		for (var k in markersets)
		{
			if(!markersets[k].state.keepalive || force)
			{
				markersets[k].deletePanel();
				markersets[k].deleteAllPoints();
				delete markersets[k];
			}
		}
		that.markersetIDs = Object.getOwnPropertyNames(markersets);
		if(markerProxy.currentSet && markersets[markerProxy.currentSet.uuid] == undefined )
			markerProxy.currentSet = undefined;		
		that.modified = false;
	}

	/******************************************************************************
	  objectify
	*******************************************************************************/
	that.objectify = function(key)
	{
		  var content = [];
		  for (var k in markersets)
		  {
			if (key == undefined || key==k)
				content.push(markerProxy.markersets[k].objectify());
		  }
		  return content;
	}



	/******************************************************************************
	  save
	*******************************************************************************/
	that.save = function(name,key,finfo)
	{
          if (finfo == undefined)
              finfo = {};

		// if key is given, only corresponding set is saved, otherwise all sets
		// in this case, name can differ (overall name for collection of sets)
		  if(typeof key =='object')	
		  	key = key.uuid;
		  	
		  var content = that.objectify(key);
		  
		  // save just one markerset
		  if (key != undefined)
		  {
			name = content[0].name;
			
			// is performed below
			//that.markersets[key].modified = false;
		  }

		
		  var subfolder = 'annotations';
		  var splitname = name.split("/")
		  if (splitname.length>1)
		  {
		  	 subfolder = splitname.slice(0,splitname.length-1).join("/");
		  	 name  = splitname[splitname.length-1];
		  }


		  name = name + ".json";


		  var content = {annotations:content};
		  function onsuccess()
		  {
		  	  for(var m in markersets)
			  {
				  if(key==undefined || key==m)
				  {	
					  that.markersets[m].modified = false;
					  // set all pointrois of this set to undmodified, otherwise he will ask for unsaved rois
					  var ps =  markersets[m].getPoints();
					  for(var k=0; k<ps.length; k++)
					  {
						  if(ps[k].roinii && ps[k].roinii.fileObject)
						  {
							ps[k].roinii.fileObject.modified = false;
						  }

					  }
				  }
			  }
		     markerProxy.modified = false;
		  }
		  uploadJSON(name,content,$.extend({subfolder:'annotations',tag:'ANO/MCP'},finfo), onsuccess);  	 
		  


	}


	/******************************************************************************
	  import
	*******************************************************************************/
	that.import = function(a, replaceIntoSet)
	{
		var current = 0;
		if (a.length == 0)
			return replaceIntoSet;
		for(var k=0; k<a.length; k++)
		{
		
		  if( replaceIntoSet!= undefined )
		  {
			  var n = that.newSet(replaceIntoSet,true);
			  n.name = a[k].name;
		  }
		  else	
		  {
			  args = {name: a[k].name,   type: a[k].type, dontupdate:true};
			  var n = that.newSet(args,true);
		  }
		  
		  n.deleteAllPoints();
		  if (a[k].isCurrent)
		  	current = k;

		  if (n.electrode_properties != undefined && a[k].electrode_properties != undefined)
			  n.electrode_properties = $.extend(n.electrode_properties,a[k].electrode_properties)

		  if(a[k].state !=undefined)
		  {
		  	n.setState(a[k].state )
		  }


		  //n.visible = false;

		  for(var p=0; p<a[k].points.length; p++)
		  {
			var point = n.addpoint(a[k].points[p].coords);
			point.p.name = a[k].points[p].name;
			point.p.comment = a[k].points[p].comment;
			if (a[k].color)
				point.setcolor(new KColor(a[k].color));     
			if (a[k].points[p].color)
				point.setcolor(new KColor(a[k].points[p].color));    
			if (a[k].points[p].visible != undefined && a[k].points[p].visible == false)
				point.togglepoint();
			if (a[k].points[p].dir)
				point.setdir(a[k].points[p].dir);

			if (a[k].points[p].size)
				point.setsize(a[k].points[p].size)
			else
	 			point.setsize( n.state.defaultradius );	
			
			if (a[k].points[p].subpoints)
				point.subpoints = a[k].points[p].subpoints;

	 		if (a[k].points[p].active != undefined && n.electrode_properties != undefined)
	 		{
	 			point.active = a[k].points[p].active;
	 			if (point.active)
					point.setcolor(new KColor([255,255,0]));     	 			
	 		}
	 		if (a[k].points[p].voltage != undefined)
	 			point.p.voltage = a[k].points[p].voltage;
	 		if (a[k].points[p].isContact != undefined)
	 			point.isContact = a[k].points[p].isContact;
	 		if (a[k].points[p].pickable != undefined)
	 			point.pickable = a[k].points[p].pickable;
	 		if (a[k].points[p].referencedImageFilename != undefined)
	 			point.referencedImageFilename = a[k].points[p].referencedImageFilename;
	 		if (a[k].points[p].referencedImageFileID != undefined)
	 			point.referencedImageFileID = a[k].points[p].referencedImageFileID;
	 		
	 		// set the roi nii to not modified, otherwise will ask on save
	 		if(point.roinii && point.roinii.fileObject)
			  	point.roinii.fileObject.modified = false;
	 			
			if (a[k].points[p].formcontent)
				point.formcontent = a[k].points[p].formcontent
			if (a[k].points[p].thresh != undefined )
			{
				point.thresh = a[k].points[p].thresh
				point.onupdate.pointROI()
			}

		  }
			/*
			 ask to load corresponding image:
			 only makes sense if we check whether image is already loaded and if we implement it in the end

			if (a[k].points.length > 0 && a[k].points[0].pointROI != undefined)
			{
				if(a[k].points[0].pointROI.refimagefileID != undefined)
				{
					alertify.confirm("You are loading a pointROI which was drawn on image id '"+a[k].points[0].pointROI.refimagefileID +"'. Do you want to load that image?",
					function(e) { if (e) 
						{
							alertify.error("Feature not implemented yet. Please load the reference image manually.")
						}
					});
				}
			}
			*/


			
		  if (a[k].type == 'electrode')
		  {
			   if (a[k].elecmodel == undefined)
			   {
				   	that.updateElectrode(n,"Medtronic3389");
			   }
			   else
			   {
				  var pts = n.getPoints();
				  if (pts.length == 2)			   	
				   	that.updateElectrode(n,a[k].elecmodel);
				  else
				  {
				  	  n.electrode_properties = $.extend(true, n.electrode_properties ,electrodes[a[k].elecmodel]);
				  	  n.elecmodel = a[k].elecmodel;
				  	  if (n.$elecmodel_combo)
				  	  	n.$elecmodel_combo.val(a[k].elecmodel);
					  n.pointChanged();
					  n.markerpoints[Object.keys(n.markerpoints)[0]].p.color.color[3] = 10;
					  n.markerpoints[Object.keys(n.markerpoints)[1]].p.color.color[3] = 10;
					  n.markerpoints[Object.keys(n.markerpoints)[0]].p.size = 1
					  n.markerpoints[Object.keys(n.markerpoints)[1]].p.size = 1
					  //n.setActive();
					  pts[0].isElectrodeEnd = pts[1];
				  }
			   }
			   n.toggleStateVar('locked')

		  }
		  
		  // addPoint above changed modified to true, we do not want that
		  n.modified = false;


 	      if (n && n.state && n.state.pickpanel)
		  {
				n.pickpanel = KPickingPanel(n);
				n.pickpanel.load(n.state.pickpanel);
		  }

		  if (n && n.state && n.state.panel_visible)
			  n.showPanel();

		  if(n.markerPanel)
		  	n.markerPanel.update();	

		}
		markerProxy.modified = false;



		return n || replaceIntoSet;
	}





	/******************************************************************************
	  loadAnnotations
	*******************************************************************************/
	that.loadAnnotations  = function(fileObject,replaceIntoSet)
	{
		var append = false;
		if (that.markersetIDs.length > 0)		
			alertify.confirm("Append to existing annotations?",function(e) { 
				if (e) 
					append = true;
				if (!append & markerProxy.modified)
					alertify.confirm("Are you sure to delete all annotations?",function(e) { if (e) { load(); } })
				else
					return load();
			});
		else
		{
			if (markerProxy.modified)
				alertify.confirm("Are you sure to delete all annotations?",function(e) { if (e) { load(); } })
			else
				return load();			
		}
	    function load()
	    {
			var a = fileObject.content;
			if (typeof a == "string")
				a = JSON.parse(a);
			if (a.content != undefined)
			  a = a.content;
			if (a.annotations != undefined)
			  a = a.annotations;

			if (!append)
				markerProxy.delAll();

			var sets = that.import(a,replaceIntoSet);

            that.hideAll()
			that.setCurrentSet( that.markersetIDs[0] )

			KViewer.markerTool.lastMarkerCollName = fileObject.filename.replace(".json","").replace(".ano","");

			return sets;
		//	if (KViewer.markerTool.isinstance)
		//		KViewer.markerTool.update();

	    }
	}

	/******************************************************************************
	  newSet
	*******************************************************************************/
	that.newSet = function(args,donotsetcurrentset) //  name, type, uuid, options)
	{

		// uuid already exists, try to take from list of markerset
		if(args && args.uuid != undefined && that.markersets[args.uuid])
		{
			if(args.showPanel)
				that.markersets[args.uuid].showPanel()
			return that.markersets[args.uuid];
		}
		
		// markerset already exists. Keep 
		if(args && args.markerpoints)
			var mset = args;
		else
			var mset = new KMarkerset( args || {} );

	    that.markersets[mset.uuid] = mset;
	    that.markersetIDs = Object.getOwnPropertyNames(markersets);	

	    
	    if (mset.type == 'electrode')
	     	that.updateElectrode(mset,mset.elecmodel);

	    if(mset.type !== 'ruler' && !donotsetcurrentset)
	    	that.setCurrentSet( mset, (args && args.hideOtherPanels),(args && args.dontupdate) );

	    return mset;
	}

	/******************************************************************************
	  delSet
	*******************************************************************************/
	that.delSet = function(key)
	{
		if (that.markersets[key] == that.currentSet)
			that.currentSet = undefined;

		if( that.markersets[key] == undefined)
			return;

		that.markersets[key].disposeLine();
		that.markersets[key].deleteAllPoints();
		that.markersets[key].deletePanel();
		that.markersetIDs = Object.getOwnPropertyNames(that.markersets);
		if (that.markersets[key].updateLine_sid)
		{
			signalhandler.detach('positionChange',that.markersets[key].updateLine_sid);
			that.markersets[key].updateLine_sid = undefined;
		}
		delete that.markersets[key];

		that.markersetIDs = Object.getOwnPropertyNames(markersets);	

		if (KViewer.markerTool.isinstance)
				KViewer.markerTool.update();
	}

	/******************************************************************************
	 append an existing set (and make current)
	*******************************************************************************/
	that.appendSet = function(mset,makecurrent) //  name, type, uuid, options)
	{
	    that.markersets[mset.uuid] = mset;
	    that.markersetIDs = Object.getOwnPropertyNames(that.markersets);	
	    if(makecurrent)
			that.currentSet = mset ;
	    return mset;
	}
   

	/******************************************************************************
	 get a set
	*******************************************************************************/
    that.getSets = function()
    {
		var keys = Object.keys(that.markersets);
		var p = [];
		for (var k = 0;k < keys.length;k++)
			p.push(that.markersets[keys[k]]);
		return p; 
    }
	/******************************************************************************
	 get a set by name
	*******************************************************************************/
    that.getSetByName = function(name)
    {
		for (var k in that.markersets)
			if(that.markersets[k].name == name)
				return that.markersets[k]; 
    }



	/******************************************************************************
	  create a new maker (by click into canvas, or directly)
	  --> this should go to the markerset itself ..?
	*******************************************************************************/
	var runnigPointID = -1;
	function createMarker(ev, mset, medviewer, coords)
	{
/*
		if ( !KViewer.globalCoordinates && medviewer == undefined)
		{
			alertify.confirm("You are currently in non-global coordinate mode.<br> In this mode, you can only create markers by drag / drop into a specific viewport.");
			return;
		}
 */		
 		if(ev !== undefined && !(ev instanceof DragEvent) && ( ev.button != 0   |  !( $(ev.target).hasClass('KViewPort_canvas') |  $(ev.target).hasClass('markerpoint') )  )   )
 			return ;

		mset  = mset || that.currentSet;

		// for the scribble, insert a new SUBPOINT if a scribble is already in this slice
		if(mset.type == "scribble"  && ev.coords == undefined)
		{
			for(var k in mset.markerpoints)
			{
				var fpoint = mset.markerpoints[k]
				var temp = medviewer.getCanvasCoordinates(fpoint.coords);
				if(math.round(temp.z_mm * 100) == math.round(medviewer.getCurrentSliceInMM()*100 ))
				{
					var realworldcoords = medviewer.getRealWorldCoordinatesFromMouseEvent(ev)._data;
					// find closest segment
					if(fpoint.isclosed)
					{
						var plinear = [];
						for(var j=0; j<fpoint.subpoints.length; j++)
						{
							temp = medviewer.getCanvasCoordinates(fpoint.subpoints[j]);
							plinear.push(temp.x_pix);
							plinear.push(temp.y_pix);
						}
						var canvascoords = medviewer.getCanvasCoordinates(realworldcoords)
						var xind = PolyK.ClosestEdge(plinear, canvascoords.x_pix, canvascoords.y_pix);

						// insert the point
						fpoint.subpoints.splice(xind.edge+1, 0, realworldcoords);
						fpoint.lastInsertedPointInd = xind.edge+1
						fpoint.movedirection = 0;
					}
					else
					{
						fpoint.subpoints.push(realworldcoords);
					}

					mset.drawAllPoints();
					return fpoint
				}
			}
		}
			
		runnigPointID++;

		// points can be created by click into canvas, drag and drop a template or load annotations, or ...
		// create on click or on drag template
		if( coords==undefined && ev)
		{
			if(ev.coords==undefined)
				coords = medviewer.getRealWorldCoordinatesFromMouseEvent(ev)._data;
			else
				coords = ev.coords;
		}

      	//var point = mset.addpoint( ev?ev.coords:undefined );
      	var point = mset.addpoint( coords,undefined,undefined,{master:Object.keys(mset.markerpoints).length == 0} );
      	
		// find the referencedImageFileID
		tviewer = medviewer
		if(medviewer == undefined)
		{
			tlist = [];
			KViewer.iterateMedViewers(function(mv){if(mv.currentFileinfo)tlist.push(mv)  })
			if(tlist.length != 1)
				//alertify.error("could not find a referenced file image");
				var dummy = 1;
			else
				tviewer = tlist[0];
		}

		if(tviewer && tviewer.currentFileinfo )
		{
			if(tviewer.currentFileinfo.SubFolder!=="")
				point.referencedImageFilename =  tviewer.currentFileinfo.SubFolder + "/" +  tviewer.currentFileinfo.Filename;
			else
				point.referencedImageFilename =  tviewer.currentFileinfo.Filename;

			point.referencedImageFileID =  tviewer.currentFileID;
		}
			
		var colors = KColorSelectorSimple('getcolors');
		if(mset.state.cyclecolors)
			point.setcolor(colors[runnigPointID % colors.length]);
		else
			point.setcolor(colors[0]);
		
		
 		point.setsize(  mset.state.defaultradius  );
		point.sethover({locked: mset.state.locked, hoverdetails: mset.state.hoverdetails });

		if( mset.markerPanel )
			mset.markerPanel.update();
 
		if (KViewer.markerTool.isinstance)
			KViewer.markerTool.update();

		return point;
		
	}
	that.createMarker = createMarker;



	/******************************************************************************
	reset all	  
	*******************************************************************************/
    that.reset = function()
	{
		that.delAll();

		if (KViewer.markerTool.isinstance)
			KViewer.markerTool.update();
		
	}

	/******************************************************************************
	set current markerset (in markerTool and select markerPanel) 
	*******************************************************************************/
	that.setCurrentSet = function(mset, hideOtherPanels, dontupdate)
	{
		if (mset == -1)
			return;


		if(typeof mset !== "object")
		{
			if (typeof mset == 'number')
				mset = markersets[Object.keys(markersets)[mset]];				
			else
				mset = markersets[mset];
		}
		

		
		// hide all other set
		if(hideOtherPanels)
		{
			for(var k in markersets)
			{
				cset = markersets[k];
				if (cset != mset)
				{
					cset.visible = false;
					if(cset.markerPanel)
						cset.markerPanel.$container.hide();
					cset.clearAllPoints();	
				}
			}
		}

		that.currentSet = mset;
		mset.visible = true;
		mset.drawAllPoints()

		if(KViewer.markerTool.isinstance && !dontupdate)
		{
			KViewer.markerTool.update();
		}
 		if(mset.markerPanel)
 		{
 			if(mset.markerPanel.panelvisible)
 				mset.markerPanel.show();

			that.activePanel = mset.markerPanel;
			$(".markerPanel").removeClass('markerPanel_active');
			mset.markerPanel.$container.addClass('markerPanel_active');
			bringToFront(mset.markerPanel.$container);
			mset.markerPanel.update();
 		}
 		mset.broadcastStateVars();

		KViewer.iterateMedViewers(function(viewer)
		{
			if (viewer.getCurrentFiberView)
			{
			  var fv = viewer.getCurrentFiberView();
			  if (fv != undefined && fv.associated_annotation != -1)
			  {
			  	 fv.setAnnotationAssoc(mset.uuid);
			  }
			}
		});
		//setAnnotationAssoc 		


	}


	that.showAll = function()
	{
		for(var k in markersets)
		{
			cset = markersets[k];
			cset.visible = true;
			cset.drawAllPoints();	
		}
	}


	that.hideAll = function()
	{
		for(var k in markersets)
		{
			cset = markersets[k];
			if (cset != markerProxy.currentSet)
			   cset.visible = false;
			cset.clearAllPoints();	
		}
	}


	/******************************************************************************
	ruler set	  
	*******************************************************************************/
	that.rulerSet = new KMarkerset('rulers', 'rulers');
	that.addRuler = function()
	{
		that.rulerSet.addpoint(undefined,'ruler');		
	}


	/******************************************************************************
	  signalhandler
	*******************************************************************************/
	signalhandler.attach("setZoom",function()
	{
		
			for(var k in markersets)
				markersets[k].drawAllPoints();
		
	});


	signalhandler.attach("canvasLayoutChanged", function()
	{
		for(var k in markersets)
				markersets[k].drawAllPoints();
		
		
	});

	/******************************************************************************
	  setDraggedPoint:
	  save the currently dragged (= resized) point as temporary object
	*******************************************************************************/
	that.setDraggedPoint = function(point, wasMouseDown)
	{
		if(point == undefined)
		{
			that.draggedPoint = undefined;
		}
		else
		{
			that.draggedPoint = 
			{
				obj: point,
				refprops: $.extend(true, {}, point.p)
			}
			if(wasMouseDown)
				if(point.parentmarkerset.type == 'pointROI' && point.roinii.fileObject)
					point.roinii.setThisPointInto3DView();
			
		}
	}
	that.setDraggedPoint();


	/******************************************************************************
	  return
	*******************************************************************************/

	return that;

}


var markerPanelList = {};


// ======================================================================================
// Special Panels
// ======================================================================================

KPointRoiTool = function()
{
	return markerProxy.newSet({name: 'pointROI', type: 'pointROI', showPanel: 1, state:{delSetOnPanelClose:1, showThroughSlice:false,hoverdetails:false }});
}


KMarkerSet_default = function()
{
	return markerProxy.newSet({uuid: 'default', name: 'default', showPanel: 1, delSetOnPanelClose:0, state: {showresizer: false} });
}


KMarkerPanel_points = function()
{
	return markerProxy.newSet({uuid: 'default', name: 'point', showPanel: 1, delSetOnPanelClose:0, state: {showresizer: false} });
}


KMarkerPanel_lines = function()
{
	var templates = {
		"AP_Wrist":{"color":'#00AAAA', "radius":4},	
		"LR_Wrist":{"color":'#AA0000', "radius":4},
	}

	return markerProxy.newSet({name: 'test',  type: 'freeline', showPanel: 1, templates: templates, state:{hoverdetails:false, createonclick: true, delSetOnPanelClose: true, showOnAllImages:1} });  
}

KMarkerPanel_circles = function()
{

	return markerProxy.newSet({name: 'circles',  type: 'circles', showPanel: 1, state:{hoverdetails:false, createonclick: true, delSetOnPanelClose: true, showOnAllImages:1, showresizer: true } });  
}


KMarkerPanel_outline = function()
{

	var mset =  markerProxy.newSet({name: 'roioutlines',  type: 'freeline', showPanel: 1, showTrash:true,
	optionalFunction:{icon:"fa-pencil",
	operation: function (mset)
		{
			if (KViewer.roiTool.getCurrentGlobal())
			{
				var roi = KViewer.roiTool.getCurrentGlobal();
				var nii = roi.content
				fillPolygon(mset.getPointsAsArray(),nii);
                signalhandler.send("positionChange");//,{id:roi.fileID});

				markerProxy.delSet(mset.uuid)


			}
			else
				alertify.error("Select some ROI imprint poylgon");
		}
	},	
	state:{hoverdetails:false, createonclick: true, delSetOnPanelClose: true, fixedsize:true, showOnAllImages:0, showresizer: false,cyclecolors:false,defaultradius:1 } });  
	mset.markerPanel.$container.css('display','none');
}

KMarkerPanel_boxes = function()
{
	var templates = {
		"Marker01":{"color":'#AA0000', "radius":40},	
		"Marker02":{"color":'#00AAFF', "radius":40},	
	}
//	var templates = {};

	return markerProxy.newSet({name: 'boxes',  type: 'boxes', showPanel: 1, templates: templates, state:{hoverdetails:false, createonclick: true, delSetOnPanelClose: true, showOnAllImages:1} });  
}


KMarkerPanel_3Drulers = function()
{
	return markerProxy.newSet({name:'3Drulers', type: '3druler', showPanel: 1, state:{hoverdetails:false, createonclick: false, delSetOnPanelClose: true, showresizer: false, keepalive: true, ignoremodified: true} });
}

KMarkerPanel_scribble = function()
{
	return markerProxy.newSet({name:'scribble', type: 'scribble', showPanel: 1, state:{hoverdetails:false, defaultradius: 5, createonclick: true, delSetOnPanelClose: true, showresizer: false, showThroughSlice:false, keepalive: false, ignoremodified: false} });
}


KMarkerPanel_roiScribble = function()
{
	return markerProxy.newSet({name:'scribble', type: 'scribble', showPanel: 1, 
		optionalFunction:{icon:"fa-pencil",
				operation: function (mset)
					{
                        mset.map_to_ROI();
					}
				},	
	state:{hoverdetails:false, defaultradius: 5, createonclick: true, delSetOnPanelClose: false, showresizer: false, showThroughSlice:false, keepalive: false, ignoremodified: true} });
}

KMarkerPanel_test = function()
{
	return markerProxy.newSet({name: 'test', showPanel: 1, delSetOnPanelClose:0, state:{hoverdetails:true} });
}

KMarkerPanel_2Drulers = function()
{
	var mset = markerProxy.newSet({name:'"2Drulers', type: 'ruler', showPanel: 1, state:{hoverdetails:false, createonclick: false, delSetOnPanelClose: true, showresizer: false, keepalive: true, ignoremodified: true} });
}

KMarkerPanel_midplane = function()
{
	var templates = {
		"DragMe":{"color":'#AA0000', "radius":3},	
	}
	return markerProxy.newSet({uuid:'_midplane_', name: 'midplane',  type: 'freeline', showPanel: 1, templates__: templates, state:{hoverdetails:false, createonclick: false, defaultradius: 3, showresizer: false, delSetOnPanelClose: true, showOnAllImages:1, ignoremodified: true} });  
}


// ======================================================================================
// Helper Tool for customizing panels
// ======================================================================================



/***************************************************************************************
*  Show a search help
****************************************************************************************/
function KMarkerPanel_configurator()
{
	var that = new dialog_generic();
	that.$frame.width(680).height(800);
	that.$frame.css({left:10, top:40} );
	that.$frame .css('z-index', 100000); 
	that.$frame.show();
	that.$menu.append("<li>Annotation Panel Configurator</li>");
	that.$frame.attr('id', 'KMarkerPanel_configurator');

	that.deleteonclose = true;

	var helptext =""
helptext += `<b>
In readings and in autoloaders you can use customized Annotation Panels.
<br>They can be configured with the following structure:
</b>
`

	var paneldef = {
		content: 
		{type: 'circles', name:'noname', showPanel: 1, state:{
		hoverdetails:0, 
		createonclick: 0, 
		cyclecolors: 1,
		defaultradius:20,
		showOnAllImages:1, 
		showresizer: 1, 
		delSetOnPanelClose: 1, 
		ignoremodified: 0,
		keepalive: 1, 
		},
		templates :{
			"Marker01":{"color":'#AA0000', "radius":40},	
			"Marker02":{"color":'#00AAFF', "radius":20},	
		}
	}};


	var $middlebar = $("<div class='' style='margin:10px;line-height:20px;'></div>").appendTo(that.$container).html(helptext);
	var $lowerbar  = $("<div class='' style='margin:0px 10px;height:90%;'></div>").appendTo(that.$container);
	
	var editor = new KJSONEditor(paneldef, "content",  {type:'json', log:1, parseonblur:1});
	editor.$container.appendTo($lowerbar).height(300).css('position', 'relative')
	editor.$textarea.parent().height(editor.$textarea.get(0).scrollHeight+30)

var docutxt = `Available types are 
 circles 				sphere
 boxes 					boxes. Radius is 3-fold array in world coordinates
 2drulers				rulers (2D) to display a diameter on screen
 3drulers				rulers (3D) to displays lengths in all projection planes
 scribble				Freeline
 pointROI				Marker with connectet ROI inside based on a threshold

name:"3Drulers",	
showPanel:1				show the marker panel 
						(otherwise accessible via AnnoTool)
state:
{
 hoverdetails:0,  		show marker details on hover
 createonclick:0, 		create new marker when clicking on image
 cyclecolors:1,   		give every marker a different color
 showresizer:1,   		show a resizer at the marker lower right side
 defaultradius:20,		default marker size
 showOnAllImages:1, 	show markers on all images or drop target only
 delSetOnPanelClose:1, 	delete all marker when panel is closed
 ignoremodified:0, 		do not check for unsaved changes
 keepalive:1		 		keep panel open when patient is switched
},

templates: 				predefined markers (for dragdrop usage)`
	
var $preview= $("<div class='modernbutton small green' style='position:absolute;top:0;right:10px'> preview <i class='fa fa-arrow-right'></i></div>");
$preview.appendTo(editor.$container).click(function()
	{
		var mset = markerProxy.newSet(paneldef.content);
	})

	var $xbar  = $("<div class='KJSONEditor' style=''></div>").appendTo($lowerbar);

	var $textarea = $("<textarea readonly autocorrect='off' autocapitalize='off' spellcheck='false' style='height:auto'></textarea>").appendTo($xbar).val(docutxt)
	$textarea.parent().height($textarea.get(0).scrollHeight+50)

	return that;

}






// ======================================================================================
// ======================================================================================
// ============= markerPanel
// ======================================================================================
// ======================================================================================
KMarkerPanel = function(markerset_in)
{
	
    var $body = $(document.body)
	// if called without an associated markerset, create one
	if(markerset_in != undefined)
		var panel_id = markerset_in.uuid;	
	else
		markerset_in = markerProxy.newSet();
	
	// if panel already exists, just show.
	if(markerset_in.markerPanel !== undefined)
	{
		var that = markerset_in.markerPanel; 
		that.$container.show();
		return that;

	}
	else
	{
		var that = new Object();
		markerset_in.markerPanel = that;

	}


	// there is only one markerset per panel. 
	var markerset = that.markerset = markerset_in; 


	that.panel_id = panel_id;


	
	/******************************************************************************
	  customize --> these values actually come from the markerset!!
	*******************************************************************************/
	var state = that.state = 
	{
		visible:true, // this is the markerset visibility!
		locked: false,
		hoverdetails: false,
		createonclick: true,
		cyclecolors: true,
		defaultradius: 5,

	}


	/******************************************************************************
	  show / hide / toggle
	*******************************************************************************/
	that.show = function()
	{
		that.panelvisible = true;
		$container.show();
		markerset.drawAllPoints();
		that.update();	
	}
	
	that.close = function()
	{
		// panel is the only access to the set, so ask to save before deletion
		if(markerset.state.delSetOnPanelClose) 
		{
			if( markerset.modified )
				alertify.confirm('This markerset was modfied, but not saved.<br> Are you sure to close it without saving? ', function(a){if(a) markerProxy.delSet(markerset.uuid) })
			else
			{
				markerProxy.delSet(markerset.uuid);
			}	
		}
		else
		{
			that.hide();
		}
	}


	that.hide = function()
	{
		that.panelvisible = false;
		$container.hide();
		if ( KViewer.markerTool.enabled == false)
		{
			markerset.clearAllPoints();
		}
	}



	that.deletePanel = function()
	{
		that.hide();
		$container.remove();
		// free view from point ROIs
		if(that.freeView)
			that.freeView.kill();

		markerset.markerPanel = undefined;
	}


	that.toggle = function(force)
	{
		that.panelvisible = typeof(force)!=="boolean"?(that.panelvisible?false:true):force;
		if(that.panelvisible) 
			that.show();
		else 
			that.hide();
	}	


	that.currentSetVisible = function ()
	{
		alert('TBD currentSetVisible');
// 		if (markerProxy.markersets[that.currentSet] != undefined)		
// 			return markerProxy.markersets[that.currentSet].visible;
// 		else
// 			return false;
	}


	/******************************************************************************
	  the panel itself
	*******************************************************************************/
	that.panelvisible = true;

	var $target= $(document.body);
	//$("div[id='markerPanel*']").remove();
	var $container = $("<div id='markerPanel"+panel_id+"' class='markerPanel movableWindows panel_floatable__ panel__' ></div>");
	$container.click(function(ev)
	{ 
		if (ev.originalEvent && $(ev.originalEvent.target).attr("contentEditable"))
			return;
		if (markerProxy.currentSet != markerset)
			markerProxy.setCurrentSet(markerset)
	});

	that.$container = $container.appendTo($target);

	var pp = getPixelPosition($body);
	var np = $(".markerPanel").length;
	$container.css("right", np*20)
	$container.css("top", np*20+70  );


	/******************************************************************************
	  tools
	*******************************************************************************/
	var $topRow    = that.$topRow = $("<div class='roiTool_panel_flex persistent ' ></div>").appendTo($container);
	$mover = $("<i class='KViewPort_tool fa fa-hand-paper-o '></i>");
	var $caption = $("<span>markerset: </span>");
	var $markersetname = $("<span>"+ markerset.name + "</span>").appendTo($caption);
	var $close = that.$close = $("<i class='KViewPort_tool fa fa-close'></i>").click( that.close );
	$topRow.append($mover).append($caption).append($("<i class='flexspacer'></i>")).append($close);
	

	$topRow.mousedown( function(ev) {
		 movableWindowMousedownFn(ev, that.$container)
		 } );


	var $fileRow   = $("<div class='roiTool_panel_flex persistent'></div>").appendTo($container);
    var $newMarker=   $("<a class='KViewPort_tool' draggable=true><i class='fa fa-plus' ></i><span> New Marker </span></a>").appendTooltip("createnNewMarker").click( 
    	function()
    	{
			if(that.state.showOnAllImages == 0) 
			{
				alertify.alert("'showOnAllImages' is disabled. Enable, or drag this button into a viewer to create marker.");
			}
			else
				markerProxy.createMarker(undefined, markerset); 
    	});
    	
		// allow to create marker on drag / drop
		$newMarker[0].ondragstart = dragstarter( function(x,name)
 				{ 
 					return function()
 					{
						return {
							type: 'markertemplate',
							callback: dropCallback,
							obj:x,
							namexx:name
						}
 					}
        		}({}), 0)
        
	
	if(that.type == 'scribble' )
	{
		$fileRow.append($("<span style='font-size:12px' > &nbsp Use mouse to draw  &nbsp</span>"));
		$newMarker.hide();
	}

    var $saveMarkers = that.$saveMarkers = $("<a class='KViewPort_tool'><i class='fa fa-save'></i><span> Save </span></a>").appendTooltip("savemarkerset")
    		.click( function(){
					if (markerset.name == "untitled")
					     
						 alertify.prompt("Name of marker set:", function(e,str) { if (e) {  
						 		markerset.name=str;  
						 		KViewer.markerTool.lastMarkerSetName = str;
						 		that.update(); 
						 		if (KViewer.markerTool.isinstance)
						 			KViewer.markerTool.update()
								markerProxy.save(undefined, markerset)
						 } },KViewer.markerTool.lastMarkerSetName);
					else
						markerProxy.save(undefined,markerset)
    		 	 }

    		 );
    $fileRow.append($newMarker).append($saveMarkers).append($("<i class='flexspacer'></i>"));
	that.$fileRow = $fileRow;


	/******************************************************************************
	  switch the icons
	*******************************************************************************/
	function switch_enabled(prop, force, invert)
	{
		// we do not want to start the KMarkerTool if not present, so check for isInstance
		markerset.state[prop] = typeof(force)!=="boolean"?(markerset.state[prop]?false:true):force;
		var togglefcn = markerset.state[prop]?"addClass":"removeClass";	
	
		if(that.markerPanel)
			btns["$"+prop][togglefcn]('KViewPort_tool_enabled');
		if (KViewer.markerTool.isinstance && KViewer.markerTool["$"+prop])
			KViewer.markerTool["$"+prop][togglefcn]('KViewPort_tool_enabled');

		return markerset.state[prop];
	}
	

	/******************************************************************************
	  toolbar
	*******************************************************************************/
	var btns = that.btns =  {};

	$("<div class='roiTool_panel_caption'></div>").appendTo($container);
	var $toolsRow    = $("<div class='roiTool_panel_flex'></div>").appendTo($container);
		btns.$locked = $("<i class='KViewPort_tool fa fa-lock'></i>").appendTooltip('lockmarkers').click( function(){ markerset.toggleStateVar('locked')} ).appendTo($toolsRow);
		btns.$createonclick = $("<i class='KViewPort_tool fa fa-pencil'></i>").appendTooltip('markercreateonclick').click( function(){ markerset.toggleStateVar('createonclick')} ).appendTo($toolsRow);
		

	    btns.$cyclecolors = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-recycle'></i>").appendTooltip('cyclecolors').click( function(){ markerset.toggleStateVar('cyclecolors') } ).appendTo($toolsRow);
	    btns.$hoverdetails = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-info'></i>").click( function(){ markerset.toggleStateVar('hoverdetails')} ).appendTooltip('markerdetailsonhover').appendTo($toolsRow);
	    btns.$showOnAllImages = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-adn'></i>").click( function(){ markerset.toggleStateVar('showOnAllImages')} ).appendTooltip('markershowOnAllImages').appendTo($toolsRow);
		btns.$showThroughSlice = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-lightbulb-o'></i>").click( function(){ markerProxy.currentSet.toggleStateVar('showThroughSlice'); markerProxy.currentSet.drawAllPoints();} ).appendTooltip('showThroughSlice').appendTo($toolsRow);
	    btns.$visible = $("<i class='KViewPort_tool KViewPort_tool_enabled fa fa-eye'></i>").click( function(){ markerset.togglePointsVisibility();   }).appendTooltip('showhideallmarkers').appendTo($toolsRow);

   	$toolsRow.append($("<i class='flexspacer'></i>"));
		btns.$defaultradius =  $(" <input type = 'text' min='0' max='100' value='"+markerset.state.defaultradius+"' /> ").on('change', changedefaultsize).appendTo($toolsRow);
		function changedefaultsize(ev) {  markerset.toggleStateVar('defaultradius',  parseFloat( btns.$defaultradius.val()) )    }
		
		KMouseSlider( btns.$defaultradius, {min:0, incrementPerPixel: .2 });
	that.$toolsRow = $toolsRow;
	

	/******************************************************************************
	pointROI 
	*******************************************************************************/

	that.pointROITool = {};
							
	var $pointROIRow   = $("<div class='roiTool_panel_flex'></div>").appendTo($container).hide();
	var $caption   = $("<span class='label'>Threshold: </span>").appendTo($pointROIRow);
	
	that.pointROITool.$thresh =  $("<input type = 'text' min='0' step=1 value='"+markerset.state.pointROIthresh+"' /> ").on('change', function (ev) { 
			// do NOT update all points every time, thresh is now pointwise
			//updatePointROIthresh();
			markerset.toggleStateVar('pointROIthresh',  parseFloat( that.pointROITool.$thresh.val() ) ); 
		}).appendTo($pointROIRow);
	KMouseSlider( that.pointROITool.$thresh, {min:-Infinity, incrementPerPixel: 2,  updateonmove: 0, updateonrelease: 1});

	/******   upper / lower      ***/
	that.pointROITool.threspen = 1;
	that.pointROITool.$thresBtn = $("<i class='RoiPen KViewPort_tool fa fa-arrow-circle-up'></i>").appendTo($pointROIRow).click(
		function(ev)
		{
			if (that.pointROITool.threspen == 1) 
			{
				that.pointROITool.threspen = 2;
				that.pointROITool.$thresBtn.removeClass('fa-arrow-circle-up').addClass('fa-arrow-circle-down');
			}
			else
			{
				that.pointROITool.threspen = 1;
				that.pointROITool.$thresBtn.removeClass('fa-arrow-circle-down').addClass('fa-arrow-circle-up');
			}
			updatePointROIthresh();
		});


	/******   only from center of circle      ***/
	that.pointROITool.$regionGrowRestrict = $("<i class='RoiPen KViewPort_tool KViewPort_tool_enabled fa fa-fw fa-map-marker'></i>").click( function(ev){selectPen('regionGrowRestrict', 'toggle')} ).appendTooltip("regionfillwithinpen").appendTo($pointROIRow);
	that.pointROITool.pen = 'regionGrowRestrict';

	function selectPen( pen, toggle )
    {
		if( pen == undefined)
			pen = 'default';
	
        if( (toggle !=undefined & pen == that.pointROITool.pen)  )
			pen = 'default'
        
        that.pointROITool.pen = pen;

        // first, toggle everything always to false
        $pointROIRow.find('.RoiPen').removeClass('KViewPort_tool_enabled');
        if( pen == 'regionGrowRestrict' )
        {
        	that.pointROITool.$regionGrowRestrict.addClass('KViewPort_tool_enabled');
        }
		updatePointROIthresh();
    }

	$pointROIRow.append($("<i class='flexspacer'></i>"));
	var $pointROI = $("<i class='fa KViewPort_tool'>3D</i>").appendTooltip('showpointroias3D').appendTo($pointROIRow).click( function(){
		if(that.freeView){ 
			that.freeView.panel.$container.show();}
		});
		 

	/******************************************************************************
	direct synchronisation of pointroi with threshold
	*******************************************************************************/
	function updatePointROIthresh()
	{
		for(var k in  markerset.markerpoints )
		{
			markerset.markerpoints[k].onupdate.pointROI();
		}

	}


	/******************************************************************************
	scribble things
	*******************************************************************************/
	that.scribbleTool = {};
							
	var $scribbleRow = that.$scribbleRow  = $("<div class='roiTool_panel_flex'></div>").appendTo($container).hide();
	var $caption   = $("<span class='label'>sLength: </span>").appendTo($scribbleRow);
	that.scribbleTool.lengthPerSegment = 5;
	that.scribbleTool.$lps =  $("<input type = 'text' min='1' step=1 value='"+ (that.scribbleTool.lengthPerSegment) +"' /> ").on('change', function (ev) 
		{ 
			that.scribbleTool.lengthPerSegment = parseFloat( that.scribbleTool.$lps.val()  ) 
		}).appendTo($scribbleRow);
	KMouseSlider( that.scribbleTool.$lps, {min:0, incrementPerPixel: .1,  updateonmove: 0, updateonrelease: 1, logScaling:10});

	$scribbleRow.append($("<i class='flexspacer'></i>"));

	if(that.markerset.type == 'scribble')
	{
		that.scribbleTool.sPenRadius = 50;
		
		var $dummy = $("<i class='KViewPort_tool fa fa-fw fa-trash'></i>").click( markerset.deleteAllPoints ).appendTooltip("delete all points").appendTo($scribbleRow);
		var $dummy = $("<i class='KViewPort_tool fa fa-fw fa-clone'></i>").click( markerset.interplate_scribbles ).appendTooltip("interpolate").appendTo($scribbleRow);
		var $dummy = $("<i class='KViewPort_tool fa fa-fw fa-pencil'></i>").click( markerset.map_to_ROI ).appendTooltip("mapToActiveROI").appendTo($scribbleRow);

		$scribbleRow.show()

	
		/******************************************************************
		modify a scribble using a circle
		******************************************************************/
		var spen_enabled = false;
		function toggleModifyScribble( force)
		{
			/****************************************************/
			function mousedown(ev)
			{
				isMouseDown = 1;
				$mmt.on('mouseleave mouseup', function(){isMouseDown= 0;  $mmt.off('mouseleave mouseup')});
				mousemove(ev); ev.stopPropagation();  return false;
			}
			var mousemove = moveUnlagger(function mousemove(ev)
			{
				/*var radius = parseFloat(that.scribbleTool.lengthPerSegment)*3;
				var max_extent_perc = medViewer.computeMaxExtentFac() / 300
				var fac = medViewer.embedrelfac * medViewer.zoomFac;
				var r = (2 * (radius)) * fac * max_extent_perc;
				*/
				var r = (that.scribbleTool.sPenRadius); // use pixels for now
				var left = window.pageXOffset+ev.clientX - r / 2 - 1;
				var top  = window.pageYOffset+ev.clientY - r / 2 - 1;

				//$spen.offset({left: left,top: top}).css({left: left,top: top,width: r,height: r});
				$spen.css({left: left,top: top,width: r,height: r});

				if(isMouseDown)
					KMarkerScribble_modify_with_pen(ev, medViewer, r/2)

				return true;
			});
			that.scribbleTool.updateSpenRadius = function(e)
			{
				var amount = (e.wheelDelta || -e.detail);
				var sstep = 10;
				that.scribbleTool.sPenRadius += (amount>0?sstep:-sstep);
				mousemove(e);
				e.stopPropagation();  e.preventDefault(); return false;
			}


			$('#scribble_pencil').remove();
			//btns.$createonclick.trigger('click');
			spen_enabled = (force==undefined)?!spen_enabled:force;
			var $spen;
			var medViewer = KViewer.viewports[0].getCurrentViewer();
			var $mmt  = medViewer.$canvas;
			// first switch everything off
			$mmt.off('mousedown mousemove mouseup mouseleave');

			if(spen_enabled)
			{
				var $spen = $("<div class='scribble_pencil roiTool_pencil'></div>").append($("<div class='roiTool_pencil_haircross left'></div>")).append($("<div class='roiTool_pencil_busy'><i class='fa fa-spinner fa-spin'></i></div>")).append($("<div class='roiTool_pencil_haircross right'></div>")).appendTo(document.body);
				var r = (that.scribbleTool.sPenRadius);
				$spen.css({left: "500px",top:"500px", width: r,height: r});
				$mmt.on('mousedown', mousedown);
				$mmt.on('mousemove', mousemove);
				var isMouseDown = 0;

			}
			else
			{
				$('.scribble_pencil').remove();
			}

		}
		that.toggleModifyScribble = toggleModifyScribble;

		KMarkerScribble_modify_with_pen = function(ev, medViewer, r)
		{
			/* modify a scribble with circle tools 
					originally, could modify it, now lets only delete points inside circle
			 
			*/
			var medViewer = KViewer.viewports[0].getCurrentViewer();
			if(!medViewer)
				return;
			//var mset = markerProxy.currentSet;
			var points = markerset.getPoints();


			for(var k=0; k<points.length; k++)
			{
				var point = points[k];
				var to_rem = [];
				var voxoords = kmath.multiply(medViewer.nii.invedges, point.coords);
				if( kmath.abs(voxoords[medViewer.getSlicingDimOfArray] - medViewer.getCurrentSlice()) > .1)
					continue
					
				for(var s=0; s<point.subpoints.length; s++) // exclude last point? no.
				{
					var coords = point.subpoints[s];
					var pixc = medViewer.getCanvasCoordinates(coords);
					//console.log(pixc)
					var px = pixc.x_pix;
					var py = pixc.y_pix;

					var cx = ev.clientX-medViewer.$canvas.offset().left;
					var cy = ev.clientY-medViewer.$canvas.offset().top;
					// project all points to pencil center
					var dx = -(cx - px);
					var dy = -(cy - py);
					var dist = Math.sqrt(dx*dx +dy*dy);
					//r = dist*.8;
					if(dist < r)
					{
						to_rem.push(s)
					}
				}
				// run over all points, remove close ones or add a new one 
				var newpoints = [];
				for(var x=0; x < point.subpoints.length; x++)
				{
					var pp = point.subpoints[x]
					if(to_rem.indexOf(x) == -1)
						newpoints.push(pp)
						
				}
				
				point.subpoints = newpoints;
				if(newpoints.length > 0)
					point.coords = point.subpoints[0];
				else
					point.deletepoint();
			}
			markerset.drawAllPoints();

		}

	}// end scribble specialities




	/******************************************************************************
	pre-defined items
	*******************************************************************************/
	var $templatesDIV   =  $("<div class='roiTool_panel_flex'></div>").appendTo($container);
	var $templatesList  =  $("<div class='markerTemplates'></div>").appendTo($templatesDIV);
	
	var $templatesButton 		=  $("<div class='roiTool_panel_flex' style='align-items:center;'></div>").appendTo($container).hide();
	//var $autocreate =  $("<div class='modernbutton small black' style='width:100%;'>autocreate all</div>").appendTo($templatesButton).click(function(){that.autocreate_templates()});
	$templatesDIV.hide();

	that.templates = {};

	that.setTemplates = function(items)
	{
		that.templates = items;
		for(var k in items)
		{
			var $temp = $("<div class='markerTemplates_item' draggable=true>"+ k +"</div>").appendTo($templatesList);
 			if(items[k].color != undefined)
 				$temp.css('background', items[k].color );

			items[k].name = k;	

 			$temp[0].ondragstart = dragstarter( function(x,name)
 				{ 
 					return function()
 					{
						return {
							type: 'markertemplate',
							callback: dropCallback,
							obj:x,
							namexx:name
						}
 					}
        		}(items[k]), k)
        	
		}
		if(that.templates && Object.getOwnPropertyNames(items).length > 0 )
		{
			$templatesDIV.show()
			$templatesButton.show();
		}
		else
		{
			$templatesDIV.hide();
			$templatesButton.hide();
		}
	}

	function dropCallback(ev, params,viewport)
	{
		var v = viewport.getCurrentViewer();
		if(v && v.viewerType == 'medViewer')
		{
			if (v.isGLenabled())
				ev.coords = v.gl.getRealWorldCoordinateFromEvent(ev)._data;
			else
				ev.coords = v.getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY)._data;
			
			var point = markerProxy.createMarker(ev, that.markerset, v);
			if(point == undefined)
				return false
				
			that.template_setpros(params.obj, point)
			
			if(point.type=='pointROI')
				window.setTimeout(function(){ point.roinii.setThisPointInto3DView(); }, 0);

		}
	}

	that.template_setpros = function(obj, point)
	{
			if(obj.name != undefined)
				point.p.name = obj.name;
			if(obj.color != undefined)
			{
				point.p.color = ( new KColor(obj.color) );
  	    	 	point.setcolor(point.p.color);
			}
			point.runcallbacks('changeProps');

			if(obj.radius != undefined)
				point.setsize( obj.radius );
	}

	/******************************************************************************
	auto-create template markers
	*******************************************************************************/
	that.autocreate_templates = function(ev)
	{
		for(var k in that.templates)
		{
			var obj = that.templates[k];
			var medViewer;
			if(obj.viewport != undefined)
			{
				var v = KViewer.viewports[obj.viewport].getCurrentViewer()
				if(v && v.viewerType == 'medViewer')
					medViewer = v;
			}

			var point = markerProxy.createMarker(ev, that.markerset, medViewer);
			that.template_setpros(obj, point)

		}
	}

	/******************************************************************************
	example of templates
	*******************************************************************************/
	var templates = {
		AP_Wrist:{color:'#00FFFF', radius:40, viewport: 0},	
		LR_Wrist:{color:'#00FFFF', radius:40, viewport: 1},
		AP_Frac: {color:'#FF0000', radius:20, viewport: 0},
		LR_Frac: {color:'#FF0000', radius:20, viewport: 1},
	}
	
	//that.setTemplates(templates);
	that.setTemplates(that.markerset.templates);



	/******************************************************************************
	the marker List
	*******************************************************************************/
	//$("<div class='roiTool_panel_caption'>Marker List</div>").appendTo($container);
	var $markerListDIV    =  $("<div class='roiTool_panel_flex'></div>").appendTo($container);
	var $markerListTable  =  $("<table class='markerTable'></table>").appendTo($markerListDIV);
	that.$markerListTable = $markerListTable;

	/******************************************************************************
	callbacks
	*******************************************************************************/
	that.callbacks = 
	{
		create: {},
		delete: {},
		toggle: {},
		changeProps: {},
		move: {},
		createinfobox: {},

	};
	

	/******************************************************************************
	update the list  
	*******************************************************************************/
	that.update = function()
	{
		$markerListTable.children().remove();

		if (markerset != undefined)
		{
			var thingstoshow = {colorsel:1, id:1, name:1, toggle:1, search:1, delete:1,  coords:0};
			var pts = markerset.getPoints();
			for (var k=0; k< pts.length;k++)
			{
				var point = pts[k];
				if(point.type == 'pointROI')
					thingstoshow.pointROI = 1;
				else 	
					thingstoshow.pointROI = 0;

				var $row = point.createMarkerRepresentation('panel', thingstoshow);
				$row.attr('marker_uuid', point.uuid)
				$markerListTable.append($row);
				if(point.hideMarkerRepresentation)
				{
					$row.hide();
				}

			}
			$container.width($markerListTable.width());
			that.updateName();
		}
	}

	that.updateName = function()
	{
		$container.width($markerListTable.width());
		$markersetname.html("<b>"+markerset.name+"</b>");
	
	}
	that.updateName();




	/******************************************************************************
	 getState 
	*******************************************************************************/
	that.getState = function()
	{
		return state;
	}

	/******************************************************************************
	  setState
	*******************************************************************************/
	function setState(state_new)
	{		
		
		if(markerset.type == 'pointROI')
			$pointROIRow.show()
		else
			$pointROIRow.hide();

		// there might follow other general state variables (for the panel itself ) again
	}
	that.setState = setState;

 
	/******************************************************************************
	 set markerset after everything is here again
	*******************************************************************************/
	that.setCurrentSet = function(mset)
	{
		markerset = that.markerset = mset;
		setState( mset.state )
	}
	
	that.setCurrentSet(markerset_in)


	return that;

}








var electrodes = 
{
   Medtronic3387: {
		contacts:[ 2.25, 5.25, 8.25, 11.25],
		approx_maedler: [ 0.2991,-1.2654 , 0.000341, 0.2784, 0.001217, -6.49E-07]	   
   },
   Medtronic3389: {
		contacts:[ 2.25, 4.25, 6.25, 8.25],
		approx_maedler: [ 0.2991,-1.2654 , 0.000341, 0.2784, 0.001217, -6.49E-07]	   
   },
   BostonOctopolar: {
		contacts:[ 2.25, 4.25, 6.25, 8.25, 10.25, 12.25, 14.25, 16.25],
		approx_maedler: [ 0.2991,-1.2654 , 0.000341, 0.2784, 0.001217, -6.49E-07]	   
   },
   Atech: {
			contacts:[ 2.25, 5.25, 8.25, 11.25],
		approx_maedler: [ 0.2991,-1.2654 , 0.000341, 0.2784, 0.001217, -6.49E-07]	   
   },

   Dixi: {
			contacts:[ 2.25, 5.25, 8.25, 11.25],
		approx_maedler: [ 0.2991,-1.2654 , 0.000341, 0.2784, 0.001217, -6.49E-07]	   
   }

}


// ======================================================================================
// ============= a marker set
// ======================================================================================
function KMarkerset( args  )
{
	// args:
	// 	uuid
	//  name
	//  type
	//  showPanel
	//  delSetOnPanelClose

    var that = new Object();

	that.uuid = args.uuid || "M" + (KMarkerset.runningSetID++);;
	that.name = args.name || "noname";
	that.type = args.type || "pointset";
	that.showTrash = args.showTrash;
	that.optionalFunction = args.optionalFunction;
	
	that.templates = args.templates || undefined;
	
	// went to state 
	//that.delSetOnPanelClose = false;
// 	if(args.delSetOnPanelClose != undefined)
// 		that.delSetOnPanelClose = args.delSetOnPanelClose;

	// showPanel: show/create on markerset creation
	var showPanel = args.showPanel || false;




	that.description = '';
	that.visible = true;


	that.showPanel = function()
	{
		KMarkerPanel(that);
		that.markerPanel.show();
		that.broadcastStateVars();
		return that.markerPanel;
	}
	that.deletePanel = function()
	{
		if(that.markerPanel)
			that.markerPanel.deletePanel();
	}

    var defaultradius = parseFloat(ViewerSettings.defaultsizemarker);
    if (defaultradius == undefined)
        defaultradius = 5;

	/******************************************************************************
	default settings for this markerset
	*******************************************************************************/
	var state = that.state = 
	{
		visible: true,
		locked: false,
		hoverdetails : false,
		createonclick : false,
		cyclecolors   : true,
		defaultradius : defaultradius,
		delSetOnPanelClose: false,
		pointROIthresh: 300,
		showThroughSlice:true,
		showOnAllImages:true,

	}

	/******************************************************************************
	custom callbacks for point creation and deletion
	*******************************************************************************/
	that.callbacks =
	{
		addpoint:{},
		deletepoint:{},
	}


	/******************************************************************************
	setType
	*******************************************************************************/
	that.setType = function(type)
	{
		that.type = type || that.type;

		for (var x in that.onupdate)
			that.onupdate[x]();

		//that.cleanFiberAssoc();
		if (that.type == 'electrode')
		  markerProxy.updateElectrode(that,that.elecmodel);
		that.pointChanged();

		if(that.type == 'pointROI')
			$.extend(true,  state, {hoverdetails: false})
		else if (that.type == 'electrode')
			$.extend(true,  state, {hoverdetails:false,cyclecolors:false,createonclick:false})
		else if (that.type == 'freeline')
			$.extend(true,  state, {hoverdetails:false,cyclecolors:false,defaultradius:2,createonclick:true})
		else if (that.type == 'surface')
			$.extend(true,  state, {hoverdetails:false,cyclecolors:false,defaultradius:2,createonclick:true})
		else
			$.extend(true,  state, {locked:false,cyclecolors:true,defaultradius:5,createonclick:false,hoverdetails:true})

		if (that.updateLine_sid != undefined)
			signalhandler.detach('positionChange',that.updateLine_sid)
	    if (that.type == 'electrode' | that.type == 'freeline' | that.type == 'surface')
			that.updateLine_sid = signalhandler.attach("positionChange",that.updateLine)

		that.broadcastStateVars();

	}

	
	/******************************************************************************
	set a variable in panel and markerTool
	*******************************************************************************/
	that.toggleStateVar = function( x, force, donotsethover )
	{
		state[x] =  force==undefined ? (state[x]?false:true):force;
		var togglefcn = state[x]?"addClass":"removeClass";
		var btns = [];
		if (KViewer.markerTool && KViewer.markerTool.isinstance) 
			btns.push(KViewer.markerTool.btns);
		if (that.markerPanel) 
			btns.push(that.markerPanel.btns);

		for(var k=0;k<btns.length; k++)
		{
			var btn = btns[k];
			if(btn["$"+x])
			{
				if(btn["$"+x].is('input') )
					btn["$"+x].val( state[x] );
				else	
					btn["$"+x][togglefcn]('KViewPort_tool_enabled');
			}
		}
		
		if(donotsethover == undefined && (x=='locked' || x=='hoverdetails'))
			that.sethover({locked:state.locked, hoverdetails: state.hoverdetails });
		
		if(x=='locked' && state.locked)
			$('.markerpoint_trash').hide();
		if(x=='locked' && !state.locked)
			$('.markerpoint_trash').show();

		return state[x];
	}

	that.broadcastStateVars = function()
	{
		for(var k in state)
		{
			that.toggleStateVar(k, state[k], 1);
		}
		// set hover only once here.
		that.sethover({locked:state.locked, hoverdetails: state.hoverdetails });
	}

	// normall only needed after loading?
	that.setState = function(state_new)
	{
		$.extend(true, that.state, state_new);
		that.broadcastStateVars();
	}



   that.electrode_properties = undefined;
   that.elecmodel = "Medtronic3389";



   that.color = [255,0,0];
   that.glmesh = {};
   that.mesh2d = {};

   that.markerpoints = {};
   that.runningID = 0;

   that.onupdate = {};
   that.removeupdater = {};




   function toggleSomeToMain()
   {
        KViewer.iterateMedViewers(function(m)
		{
			if (KViewer.mainViewport == -1)
		 		KViewer.toggleMainViewport(m.viewport.viewPortID);			
		});

	    if (KViewer.mainViewport == -1)
			   KViewer.navigationTool.worldMaster();

   }



   that.Rectifytransform = function()
   {
	   var points = that.getPoints();
	   for (var k = 0; k < KViewer.viewports.length ;k++)
	   {
	   		if (KViewer.viewports[k] != undefined && KViewer.viewports[k].medViewer != undefined && KViewer.viewports[k].medViewer.nii != undefined)
		   		var iedges = math.inv(KViewer.viewports[k].medViewer.nii.edges);
	   }
	   if (iedges == undefined)
	   	 return;
	   var p0 = points[0].coords
	   var p1 = points[1].coords

	   var diff   = math.add(p1, math.multiply(p0, -1) );
	   diff._data[3] = 0;
	   var diffnorm = math.multiply(diff,1/math.norm(diff._data));
//	   var origin = math.matrix(math.multiply(math.add(p1, p0), 0.5));
	   var origin = math.matrix(p1);


	   var y_vector =iedges._data[2];
	   y_vector = math.multiply(y_vector, -Math.sign(y_vector[0]*diff._data[0]+y_vector[1]*diff._data[1]+y_vector[2]*diff._data[2])) 
	  

	   
	   var rotmat = calcRotmatForVectors(diffnorm._data,y_vector);
	   var T = math.matrix([ [1, 0, 0, origin._data[0]],[0, 1, 0, origin._data[1]],[0, 0, 1, origin._data[2] ],[0, 0, 0, 1] ]);
	   var E =  math.multiply(T,rotmat);



	   KViewer.currentPoint = math.matrix(p1);
	   KViewer.reorientationMatrix.notID = true;
	   KViewer.reorientationMatrix.matrix =  E;

   	   if (KViewer.navigationMode == 0)
		   KViewer.navigationTool.switchToNavimode(2);
	   toggleSomeToMain();
	   
		signalhandler.send("reslice positionChange");


   }
  
   that.RECTtransform = function()
   {

           var points = that.getPoints();
           if(points.length !== 3)
           { alertify.alert("Must select 2 or 3 points");    return;    }
		 
		   var p0 = points[0].p.coords;
		   var p1 = points[1].p.coords;
		   var p2 = points[2].p.coords;

  		   var e0   = (math.add(p1, math.multiply(p0, -1) ));
  		   math.normalize(e0); e0 = e0._data;
  		   var e1   = math.add(p2, math.multiply(p0, -1) )._data;
		   var dot = (e0[0]*e1[0]+e0[1]*e1[1]+e0[2]*e1[2]);
		   e1[0] = e1[0] - dot*e0[0];
		   e1[1] = e1[1] - dot*e0[1];
		   e1[2] = e1[2] - dot*e0[2];
		   e1 = math.matrix(e1)
		   math.normalize(e1);         
		   var e2 = math.cross(e0,e1);
		   e2._data.push(0);
		   var rotmat = math.transpose(math.matrix([e0,e1._data,e2._data,[0,0,0,1]]));
		   var origin =p0;


         var T = math.matrix([ [1, 0, 0, -origin[0]],[0, 1, 0, -origin[1]],[0, 0, 1, -origin[2] ],[0, 0, 0, 1] ]);
            var E =  math.multiply(math.inv(rotmat),T);

            KViewer.reorientationMatrix.notID = true;
            KViewer.reorientationMatrix.matrix =  E;

			

       	 /*   if (KViewer.navigationMode == 0)
			   KViewer.navigationTool.switchToNavimode(2);
	  	    toggleSomeToMain();*/
            setTimeout(function() {
               signalhandler.send("positionChange"); 
			KViewer.markerTool.update()
               },10);


   }

   that.MCPtransform = function()
   {

           var points = that.getPoints();
           if(points.length !== 2  &  points.length !== 3)
           { alertify.alert("Must select 2 or 3 points");    return;    }

           if(KViewer.mainViewPort == -1)    { alertify.alert("To see the ACPC Line horizontally, go into master mode.");      }

           ////// GENERAL COMMENT:    IN LEKSELL system back top right is negative. Do the same for MCP??

           // 2 point mode
           if(points.length == 2)
           {
             if(points[1].coords[1] > points[0].coords[1])       {  var p0 = points[0].coords;     var p1 = points[1].coords;   }
             else                                  {  var p0 = points[1].coords;     var p1 = points[0].coords;   }

              var diff   = math.add(p1, math.multiply(p0, -1) );
              diff[3] = 0;
              var diffnorm = math.multiply(diff,1/math.norm(diff));
              var origin = math.matrix(math.multiply(math.add(p1, p0), 0.5))._data;

              // search for the AP (y) axis for a nifit and aling the line there. It will then appear horizontally in coupled mode ??
              var y_vector = [0,0,0,0];
              y_vector[1]= 1;
              var rotmat = calcRotmatForVectors(y_vector,diffnorm);
            }
            else if(points.length == 3 )
            {
              // greatest Z
              var order = [0,1,2];

              var arr = [ points[0].coords[2], points[1].coords[2], points[2].coords[2]   ];
              var gz  = arr.indexOf(Math.max.apply(Math, arr));
              var p2 = points[gz].coords;
              order.splice(gz,1);
              // greatest X --> AP
              if(points[order[1]].coords[1] > points[order[0]].coords[1])       {  var p0 = points[order[0]].coords;     var p1 = points[order[1]].coords;   }
              else                                  {  var p0 = points[order[1]].coords;     var p1 = points[order[0]].coords;   }

              p0 = p0.slice(0,3);
              p1 = p1.slice(0,3);
              p2 = p2.slice(0,3);
              var diffX   = math.add(p1, math.multiply(p0, -1) );
              var origin = math.multiply(math.add(p1, p0), 0.5);
              var diffZ   = math.add(origin, math.multiply(p2, -1) );
              var newX  = math.multiply(diffX,1/math.norm(diffX._data));
              var newY = math.cross(diffZ,diffX); newY  = math.multiply(newY,1/math.norm(newY._data));
              var newZ = math.cross(newY,newX); newZ  = math.multiply(newZ,1/math.norm(newZ._data));
              newX = newX._data;
              newY = newY._data;
              newZ = newZ._data;
              newX.push(0);              newY.push(0);              newZ.push(0);
              var rotmat  = (math.transpose([  newY, newX, newZ, [0,0,0,1] ]));
             // rotmat = math.multiply(rotmat, math.diag([1,1,-1,1])  );

            }


			if (origin._data)
				origin = origin._data;
				

            var T = math.matrix([ [1, 0, 0, origin[0]],[0, 1, 0, origin[1]],[0, 0, 1, origin[2] ],[0, 0, 0, 1] ]);
            var E =  math.multiply(T,rotmat);

            KViewer.reorientationMatrix.notID = true;
            KViewer.reorientationMatrix.matrix =  E;
            signalhandler.send("reslice positionChange");

       	   if (KViewer.navigationMode == 0)
		   KViewer.navigationTool.switchToNavimode(2);
	  	   toggleSomeToMain();


  }

   that.objectify = function()
   {
   	  	var pts = that.getPoints();
   		var p = [];
   		for (var k = 0;k < pts.length;k++)
   		{
             var point = pts[k];
			 var temp = {
			 		coords : point.p.coords,
					coords_transformed : markerProxy.to_transformed( point.p.coords  )._data,   	   
					comment :point.p.comment,
					size:point.p.size,
					active:point.active,
					voltage:point.p.voltage,
					isContact:point.isContact,
					dir:point.dir,
					pickable:point.pickable,
					visible : point.visible,
					name:point.p.name,
					color:  point.p.color.getHEX(),
					referencedImageFilename: point.referencedImageFilename,
					referencedImageFileID: point.referencedImageFileID,
					subpoints:point.subpoints,
					formcontent:point.formcontent,
					thresh:point.thresh

			 }
			 if(1)//point.shape == 'box')
			 {
				// calculate the projections in voxels on a certain image
				if(point.referencedImageFileID !== undefined)
				{
					var nii = KViewer.dataManager.getFile(point.referencedImageFileID);
					if (nii != undefined)
					{
						nii = nii.content;
						if (nii.invedges == undefined)
						nii.invedges = math.inv(nii.edges);
						var pcc = math.multiply( nii.invedges , point.p.coords)._data; // the center point
						var prr = math.multiply( nii.invedges , point.p.size)._data; // the radius

						temp.coords_vox = math.round(pcc).slice(0,3).map(Math.abs);
						temp.size_vox   = math.round(prr).slice(0,3).map(Math.abs);
					}
				}

			 }
			 
			 // if pointROI, save the underlying contrast file and the statistics
			 if(point.roinii)
			 {
			 	var r = point.roinii;
			 	temp.pointROI = 
			 	{
					refimagefileID: r.refimagefileID,
					stats: r.stats
				}

			 }
			 p.push(temp);


   	 	}   	 
   	 	var ret = {name:that.name, points:p, type:that.type,  state:that.state};

        if (that.pickpanel)
        {
        	ret.state.pickpanel = that.pickpanel.objectify();
        }

		if (that.markerPanel && that.markerPanel.panelvisible)
			ret.state.panel_visible = true;
		else
			ret.state.panel_visible = false;

		if (that.type == "electrode")
		{
			ret.isCurrent = that.isCurrent;
			ret.elecmodel = that.elecmodel;
			ret.electrode_properties = that.electrode_properties;
		}
		return ret;
   }



  that.getPointsByName = function()
   {
   		var keys = Object.keys(that.markerpoints).sort();
   		var p = {};
   		for (var k = 0;k < keys.length;k++)
   			p[that.markerpoints[keys[k]].p.name] = that.markerpoints[keys[k]];
   		return p; 
   }

   that.getPoints = function()
   {
   		var keys = Object.keys(that.markerpoints).sort();
   		var p = [];
   		for (var k = 0;k < keys.length;k++)
   			p.push(that.markerpoints[keys[k]]);
   		return p; 
   }

   that.getPointsAsArray = function()
   {
   	   var pts = that.getPoints()
   	   var ps = [];
   	   for (var k = 0 ; k < pts.length;k++)
   	   {
   	   	  var p = pts[k].p.coords;
   	   	  ps.push(p);
   	   }
	   return ps;
   }

   that.insertpoint = function(coords,type,after,params)
   {
		var id = after.uuid+"_9";
		var i = 8;
		while (that.markerpoints[id] != undefined)
			id = after.uuid+"_"+(i--);

  		return that.addpoint(coords,type,id,params);
   }   

   that.addpoint = function(coords,type,id,params)
   {

   		if(type == undefined)
   			type = that.type;

		if (id == undefined)
        	id = that.uuid + "P" +  ('00000'+(that.runningID++)).slice(-5) ;
        	
        var x = KMarkerpoint(that, id);
        that.markerpoints[id] = x;

		/* these two types can be removed in future */
		if (type =='ruler')
		{
			x.type = 'ruler';
			x.dir = [-50,90];
			x.getLength = function() { return  Math.sqrt(this.dir[0]*this.dir[0]+this.dir[1]*this.dir[1]) }
		}
		else if (type =='rectangles')
		{
			x.type = 'rectangles';
			x.dir = [20,20];
		}

        
        if(that.type == 'pointROI'  )
        {
			x.type = 'pointROI';
       		x.roinii = createPointROI(x);
       		if(coords == undefined)
       			x.roinii.setThisPointInto3DView();
        }
        else if(that.type == 'boxes' )
        {
			x.type  = 'point';
			x.shape = 'box';
        }
        else if(that.type == '3druler'  )
        {
			x.type  = '3druler';
			x.shape = 'box';
        }
        else if(that.type == 'scribble'  )
        {
			x.type  = 'scribble';
			x.shape = 'scribble';
			//x.shape = 'box';
			x.subpoints  = [];

        }
		
		if(x.shape && x.shape == 'box')
        	x.p.size  = [x.p.size,x.p.size,x.p.size,0 ]; // box has 3D size


		if (params)
		{
			if (params.size)
				x.p.size = params.size;
			if (params.master)
				x.master = true;
			if (params.hideMarkerRepresentation)
				x.hideMarkerRepresentation = 1;
		}

        if (coords)
			x.movepoint(coords)
        else
        {
			{	
				if(KViewer.currentPoint)
					x.movepoint(KViewer.currentPoint._data)
			}
        }



		if (type =='ruler')// || type =='rectangles')
		{
			if (x.$markers[Object.keys(x.$markers)[0]] == undefined)
				return  that.markerpoints[id];
			var mv = x.$markers[Object.keys(x.$markers)[0]].medViewer;
			var fac = -0.2*mv.computeMaxExtentFac()/mv.zoomFac;
			x.dir = [fac,0];
			x.drawpoint();
		}


        for (var x in that.onupdate)
            that.onupdate[x]();
        
		if(!that.state.ignoremodified)
		{
			markerProxy.modified = true;
			that.modified = true;
		}
		for(var k in that.callbacks.addpoint)
		{
			that.callbacks.addpoint[k](x);
		}
		for(var k in that.callbacks.deletepoint)
		{
			x.callbacks.delete[k] = that.callbacks.deletepoint[k];
		}
		
        return that.markerpoints[id];
   }



	function iteratePoints(fun)
	{
       for(var id in that.markerpoints)
       {
          fun(that.markerpoints[id]);
       }		
	}

   // this draws all points of a markerset
    that.drawAllPoints = function() { 
     if (KViewer.markerTool && that.state.visible && that.visible)//|| KViewer.markerTool.enabled != 0))
     {
    	iteratePoints(function(x) {x.drawpoint() }); that.drawLine();
     } }
   // clear all points from the viewports
	that.clearAllPoints = function() { 
		iteratePoints(function(x) {x.clearpoint() }); 
		that.disposeLine(); 
		that.cleanFiberAssoc();
		}
   // really delete all points
 	that.deleteAllPoints = function() { 
		that.cleanFiberAssoc();
 		iteratePoints(function(x) {x.deletepoint() }); 
 		that.disposeLine(); 
 		}
   // this toggles movability and hoverdetails of all points of a markerset
    that.sethover = function(state) { iteratePoints(function(x) {x.sethover(state )}) }
   // this toggles visibility all points of a markerset
    that.togglePointsVisibility = function(state) 
    { 
    	if(state == undefined)
    		state = !that.state.visible;

		that.toggleStateVar('visible', state)
	
		iteratePoints(function(x) {x.togglepoint(state )
		if (!state)
			that.disposeLine(); 
		else		
			that.drawLine();
		} ) 
		return that.state.visible;
    }

   that.drawLine = function()   
    { 
		KViewer.iterateMedViewers( function(medViewer)
		{
		  var viewport = medViewer.viewport;
		  if (viewport == undefined)
		  	return;
		  if (that.visible && that.state.visible && !medViewer.mosaicview.active && (KViewer.markerTool.enabled != 0  || ( that.markerPanel &&  that.markerPanel.panelvisible ) ))
		  {
			  var colors = KColorSelectorSimple('getcolors');
			  var col;
			  if (that.color != undefined)
				col = colors[that.color]

			  var lid = 'LINE_' + viewport.viewPortID  + "_" + that.uuid ;
			  if ( medViewer.gl != undefined && medViewer.isGLenabled() )
			  {

				  if (that.glmesh[lid] != undefined)
					that.glmesh[lid].dispose();
				  if (that.type == 'electrode')
					that.glmesh[lid] = medViewer.gl.createTrace(that,{width:1,color:new KColor([1,1,1])});
				  if ( that.type == 'freeline')
				  {
				  	var wid = 1;
				  	if (KViewer.defaultFOV_mm != "")
				  	 wid = KViewer.defaultFOV_mm/100;
					that.glmesh[lid] = medViewer.gl.createTrace(that,{width:wid,color:col});
				  }
				  else if (that.type == 'surface')
				  {
					that.glmesh[lid] = medViewer.gl.createFreeSurf(that,{width:1});

				  }
			  }
			  else
			  {
				   if (that.mesh2d[lid] != undefined)
						that.mesh2d[lid].remove()
				  if ((that.type == 'electrode' | that.type == 'freeline' )&& medViewer.nii != undefined)
					that.mesh2d[lid] = medViewer.createTrace(that,{color:col});

			  }
		  }
		});

    }

  
   that.updateLine = function()   {
		that.disposeLine();
		that.drawLine(); 
   }
   if (that.type == 'electrode' | that.type == 'freeline' | that.type == 'surface')
   {
   		if (that.updateLine_sid == undefined)
   			that.updateLine_sid = signalhandler.attach("positionChange",that.updateLine)
   }		
    
   that.disposeLine = function()   
    {
    	if (KViewer.iterateMedViewers)
			KViewer.iterateMedViewers( function(medViewer)
			{
			  var viewport = medViewer.viewport;
			  if (viewport == undefined)
			  	 return;
			  var lid = 'LINE_' + viewport.viewPortID  + "_" + that.uuid ;
			  if (medViewer.gl != undefined )
			  {
				  if (that.glmesh[lid] != undefined)
				  {
					that.glmesh[lid].dispose();
					delete that.glmesh[lid];
				  }
			  }
			   if (that.mesh2d[lid] != undefined)
					that.mesh2d[lid].remove()
				  //if (that.type == 'freeline')
					//that.mesh2d[lid] = medViewer.createTrace(that);

			});
    }

    that.computeInfo = function()
    {
			if (that.type == 'freeline')
			{
				var points = that.getPoints();
				var dist = 0;
				var lastdir;
				var ang = "";
				for (var k =0;k <points.length-1;k++)
				{	
					var n = [ points[k].p.coords[0]-points[k+1].p.coords[0],
								points[k].p.coords[1]-points[k+1].p.coords[1],
								points[k].p.coords[2]-points[k+1].p.coords[2] ];
					var d = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
					dist += d;
					n = [n[0]/d,n[1]/d,n[2]/d];
					if (lastdir != undefined)
						ang += (180-Math.round(Math.acos(lastdir[0]*n[0]+lastdir[1]*n[1]+lastdir[2]*n[2])/Math.PI*180))+";";
					lastdir = n;

				}
				if (that.setInfo)
					that.setInfo("length: " + dist.toFixed(1) + " mm  degs:" + ang);
			}
			else
			{
				if (that.setInfo)
					that.setInfo("area: " + (that.surfacearea/100).toFixed(4) + " cm^2");
			}
    }

	that.pointChanged = function()
	{

		var was_updated = false; // to do not interfere with single point updates for fiberselection
		if (that.type == 'electrode' && that.electrode_properties != undefined)
		{
			var keys = Object.keys(that.markerpoints);
			if (keys.length >= 2)
			{
				var p1 = that.markerpoints[keys[0]].p.coords;
				var p2 = that.markerpoints[keys[1]].p.coords;
				var n = [p1[0]-p2[0],p1[1]-p2[1],p1[2]-p2[2]];
				var norm = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
				n = [n[0]/norm,n[1]/norm,n[2]/norm];
				for (var k = 2; k < keys.length;k++)
				{
					var dist = that.electrode_properties.contacts[k-2];
					that.markerpoints[keys[k]].p.coords = [p2[0]+n[0]*dist,p2[1]+n[1]*dist,p2[2]+n[2]*dist,1];
					that.markerpoints[keys[k]].drawpoint();
				}
			}
			var points = that.getPoints();

			var funs = [];
			for (var k =0;k <points.length;k++)
			{	
				for (j in points[k].onupdate)
					funs.push(points[k].onupdate[j])
			}

			iterateSync2(0,funs.length,
				function(j,ondone) { 
				funs[j](ondone);
				  });		

			was_updated	= true;

		} 
		else if (that.type == 'surface')
		{
			var points = that.getPoints();
			if (points.length >= 3)
			{

				var pts = new Float32Array(3*points.length*2)
				var p2 = [];
				var phi = [];
				var cxx = 0;
				var cyy = 0;
				var czz = 0;
				var cxy = 0;
				var cxz = 0;
				var cyz = 0;
				var m = [0,0,0];
				for (var k = 0; k < points.length;k++)
				{
					var q = points[k].p.coords; 
					m[0]+= q[0];
					m[1]+= q[1];
					m[2]+= q[2]
				}
				m[0] /= points.length;
				m[1] /= points.length;
				m[2] /= points.length;
				for (var k = 0; k < points.length;k++)
				{
					var q = points[k].p.coords; 
					cxx += (q[0]-m[0])*(q[0]-m[0]);
					cyy += (q[1]-m[1])*(q[1]-m[1]);
					czz += (q[2]-m[2])*(q[2]-m[2]);
					cxy += (q[0]-m[0])*(q[1]-m[1]);
					cyz += (q[2]-m[2])*(q[1]-m[1]);
					cxz += (q[0]-m[0])*(q[2]-m[2]);
				}
				var ev = math.EV3(math.matrix([[cxx,cxy,cxz],[cxy,cyy,cyz],[cxz,cyz,czz]]));
				
				for (var k = 0; k < points.length;k++)
				{
					var q = points[k].p.coords; 
					var x_ =    (q[0]-m[0])*ev[0].v[0] + (q[1]-m[1])*ev[0].v[1] + (q[2]-m[2])*ev[0].v[2];
					var y_ =  (q[0]-m[0])*ev[1].v[0] + (q[1]-m[1])*ev[1].v[1] + (q[2]-m[2])*ev[1].v[2];
					var n = Math.sqrt(x_*x_+y_*y_);
					phi[k] = {d:points[k].p.size,a:[x_,y_],i:k,p: Math.atan2(x_/n,y_/n),q:q.slice(0)};

				}
                phi.sort(function(a,b) { 
                return a.p-b.p 
                });
                for (var k = 0; k < points.length;k++)
                {
                	p2[2*k] = phi[k].a[0];
                	p2[2*k+1] = phi[k].a[1];
					pts[3*k] = phi[k].q[0];
					pts[3*k+1] = phi[k].q[1];
					pts[3*k+2] = phi[k].q[2];
                }

				var trigs = earcut(p2,null,2);


				var normals = new Float32Array(3*points.length*2)
				var area = 0;
				for (var k = 0;k < trigs.length/3;k++)
				{
					var a = [pts[3*trigs[3*k]]  ,pts[3*trigs[3*k]+1],pts[3*trigs[3*k]+2]];
					var b = [pts[3*trigs[3*k+1]],pts[3*trigs[3*k+1]+1],pts[3*trigs[3*k+1]+2]];
					var d = [pts[3*trigs[3*k+2]],pts[3*trigs[3*k+2]+1],pts[3*trigs[3*k+2]+2]];
					var n =     [(b[1]-a[1])*(d[2]-a[2]) - (b[2]-a[2])*(d[1]-a[1]), 
								 (b[2]-a[2])*(d[0]-a[0]) - (b[0]-a[0])*(d[2]-a[2]),
								 (b[0]-a[0])*(d[1]-a[1]) - (b[1]-a[1])*(d[0]-a[0])];
					area += Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);
					for (var j=0;j<3;j++)
					{	
						normals[3*trigs[3*k+j]+0] += n[0];
						normals[3*trigs[3*k+j]+1] += n[1];
						normals[3*trigs[3*k+j]+2] += n[2];
					}

				}

				var sgc = 0;
				for (var k = 0; k < points.length;k++)
				{
					var no = math.sqrt(normals[3*k]*normals[3*k] +normals[3*k+1]*normals[3*k+1] +normals[3*k+2]*normals[3*k+2]);
					normals[3*k] /= no;
					normals[3*k+1] /= no;
					normals[3*k+2] /= no;
					sgc += normals[3*k]*ev[2].v[0]+normals[3*k+1]*ev[2].v[1]+normals[3*k+2]*ev[2].v[2];

				}
				sgc = Math.sign(sgc);

				var offs = points.length*3;
                for (var k = 0; k < points.length;k++)
                {
					var thck =  phi[k].d*0.4;
					pts[3*k+offs] = pts[3*k] + ev[2].v[0]*thck;
					pts[3*k+1+offs] = pts[3*k+1] + ev[2].v[1]*thck;
					pts[3*k+2+offs] = pts[3*k+2] + ev[2].v[2]*thck;
					pts[3*k] = pts[3*k] - ev[2].v[0]*thck;
					pts[3*k+1] = pts[3*k+1] - ev[2].v[1]*thck;
					pts[3*k+2] = pts[3*k+2] - ev[2].v[2]*thck;

					normals[3*k+offs] = sgc*normals[3*k];
					normals[3*k+1+offs] = sgc*normals[3*k+1];
					normals[3*k+2+offs] = sgc*normals[3*k+2];
					normals[3*k] = -sgc*normals[3*k];
					normals[3*k+1] = -sgc*normals[3*k+1];
					normals[3*k+2] = -sgc*normals[3*k+2];
                }
                var l = trigs.length;
				for (var k = 0; k < l; k++)
					trigs[k+l] = trigs[k]+points.length;


				that.resorted = phi;
				that.points =  pts;
				that.indices = new Float32Array(trigs);
				that.normals = normals;
				that.surfacearea = area/2;
			}
			that.computeInfo()

		}
		else if (that.type == 'freeline' )
		{
			that.computeInfo()
		}

		that.disposeLine();	
		if ( markerProxy && markerProxy.currentSet && markerProxy.currentSet.visible && that.type != 'pointset')
		{
			that.drawLine();
		}

		return was_updated;
	}

    that.cleanFiberAssoc = function()
    {
    	if ( KViewer.findAllViews)
    	{
			var tcks = KViewer.findAllViews('fibers');
			for (var k = 0 ;k < tcks.length;k++)
				if (tcks[k].associated_annotation == that.uuid)
				{
					tcks[k].removeAnnotationAssoc();
				}
    	}
    }

	that.setActive = function()
	{
		 var ps = that.getPoints();
		 for (var j = 0; j < ps.length;j++)
		 	if (ps[j].active)
		 		ps[j].select();
	}

	that.getActive = function()
	{
		if(that.type != 'electrode')
			return;

		var pts = that.getPoints();
		for (var k = 2;k  < pts.length;k++)
		{
			if (pts[k].active)
			{
				return {pts:pts[k],pos:that.electrode_properties.contacts[k-2]}
				break;
			}
		}
	}

	/******************************************************************************
	scribble specific
	*******************************************************************************/
	that.interplate_scribbles = function()
	{
		KMarkerScribble_interpolate_slices(that);
	}
	
	that.map_to_ROI = function()
	{
		$(document.body).addClass("wait");
        setTimeout(function()
        {
			var roi = KViewer.roiTool.getCurrentGlobal();
			if(roi == undefined	)
			{
				roi = KViewer.roiTool.lastCurrentROIID;
				if(roi != undefined	)
					roi = KViewer.dataManager.getFile(roi)
			}
			if(roi == undefined	)
			{
				alertify.error("Please create or activate a ROI for filling!")
				$(document.body).removeClass("wait");
        		return false
			}

			var nii = roi.content	
			var points = that.getPoints()
			var changedPoints = [];
			for(var k=0; k<points.length; k++)
			{

				var ret = fillPolygon(points[k],roi.content, false);
				changedPoints = changedPoints.concat(ret.changedPoints)

			}
			if(changedPoints.length>0)
			{
				KViewer.roiTool.history.record('startRecording', undefined, roi,'use_as_last');
				KViewer.roiTool.history.add(changedPoints, 1, roi);
				KViewer.roiTool.history.record('stopRecording');
			}
			signalhandler.send("positionChange");//,{id:roi.fileID});
    		$(document.body).removeClass("wait");
			
        },50);
	}


	if(args.delSetOnPanelClose != undefined)
 		state.delSetOnPanelClose = args.delSetOnPanelClose;
 	if(args.showThroughSlice != undefined)
 		state.showThroughSlice = args.showThroughSlice;
	
	/******************************************************************************
	allow to override all state vars with args.state
	*******************************************************************************/
	if(args.state !=undefined)
	{
		$.extend(true, state, args.state)
	}    


    /***************************************************************************************
    * finalise
    ****************************************************************************************/
	// show panel on creation ?
	if(showPanel)
		that.showPanel();
	
	



    return that;
}
KMarkerset.runningSetID = 0;






function iterateSync2(current,end,fun)
{
if (current < end)
	fun(current,function() {iterateSync2(current+1,end,fun) });
}






// ======================================================================================
// ============= global variable to define point callbacks
// ======================================================================================
var KMarkerpoint_callbacks = 
{
		create:{},
		delete: {},
		toggle: {},
		changeProps: {},
		move:{},
		active:{},
		jumptopoint:{},
		mousedown:{},
		createinfobox: {}

}



// ======================================================================================
// ============= a single marker point
// ======================================================================================

function KMarkerpoint(parentmarkerset, id)
{
    var that = new Object();

	var markerPanel = parentmarkerset.markerPanel; 

	var recreateInfoBoxOnHover = false;

	that.type = "point";

    that.visible = true;
	that.locked = false;
	that.active = true;

	that.shape = 'sphere';
	//that.shape = 'box';



    // relevant public properties to save
    that.p = {};
    that.p.uuid = id;
    that.p.name = 'noname';
    that.p.coords = [0,0,0,0];
    that.p.comment = "";
    that.p.color = new KColor('#FF0000');
	that.p.parentviewport = 0;
    
    if(that.shape == 'sphere')
		that.p.size = 5; // size in mm. single number for spheres, 3 numbers for box
    else if(that.shape == 'box')
		that.p.size = [5,5,5,0]; // size in mm. single number for spheres, 3 numbers for box
	
	
	that.__defineGetter__('uuid', function() { return this.p.uuid; });
	that.__defineGetter__('coords', function() { return this.p.coords; });
	that.__defineGetter__('size', function() { return this.p.size; });

	that.onupdate = {};
	that.removeupdater = {};

    
    that.parentmarkerset = parentmarkerset; 

    var $markers = {};
    that.$markers = $markers;


    that.movepoint = function(coords, medViewer, ev)
    {
        that.p.coords = coords; 
	
	    that.drawpoint();
    
    
    	if (that.parentmarkerset.pointChanged)
			if (!that.parentmarkerset.pointChanged())
			{
			   for (var x in that.onupdate)
				 that.onupdate[x](medViewer, ev); 			
			}
	
		if(!that.parentmarkerset.state.ignoremodified)
		{
			markerProxy.modified = true;
			that.parentmarkerset.modified = true;
		}

             
    }

    that.setdir = function(dir)
    {
		that.dir = dir;
        that.drawpoint();

    }
   

    that.point = that.movepoint;

	that.incsize = function(amount, medViewer)
	{
		if(that.shape == 'sphere')
			var newsize = that.p.size + amount
		else if(that.shape == 'box')
			var newsize = [0,0,0,0];  newsize[0] = that.p.size[0]+amount; newsize[1] = that.p.size[1]+amount; newsize[2] = that.p.size[2]+amount;

		that.setsize(newsize, medViewer);
	}


    that.setsize = function(siz, medViewer, ev)
    {
		
    	if(that.shape == 'sphere' | that.shape == 'scribble')
    	{
    		that.p.size = siz;
			if(that.p.size < 0.1) that.p.size = 0.1;
    	}
    	else if(that.shape == 'box')
    	{
    		if( typeof(siz) == 'number')
    		{
				that.p.size[0] = siz; that.p.size[1] = siz; that.p.size[2] = siz;
    		}
    		else
    		{
    			that.p.size = siz;
    			that.p.size[3] = 0;
    		}
			//if(that.p.size[0] < 0.1) that.p.size[0] = 0.1; if(that.p.size[1] < 0.1) that.p.size[1] = 0.1; if(that.p.size[2] < 0.1) that.p.size[2] = 0.1;
    	}

		that.drawpoint();
 		for (var x in that.onupdate)
           that.onupdate[x](medViewer, ev);
    
    }

	that.getsubpoint = function(index, t)
	{
		if( index<0)
			index = that.subpoints.length + index;
		var index = index % that.subpoints.length;
		return that.subpoints[index];
	}

    that.setsizeFromMouseEvent = function(edgeindex,refpoint, newpoint, medViewer, donotrecalcflag)
    {
		if (that.parentmarkerset.state.fixedsize)
			return;

		if(refpoint == undefined || refpoint[0] == undefined || newpoint == undefined || newpoint[0] == undefined)
			return;


    	// calc the size from a mouse event (in pixel coordinates)
     	var rwpos_ref = medViewer.getRealWorldCoordinatesFromMouseEvent(refpoint[0], refpoint[1]);
     	var rwpos_new = medViewer.getRealWorldCoordinatesFromMouseEvent(newpoint[0], newpoint[1]);
		var refsize = markerProxy.draggedPoint.refprops.size ;
		var refpos  = markerProxy.draggedPoint.refprops.coords ;

		var rw_diff = ( math.add(rwpos_ref, math.multiply(rwpos_new,-1) ) );

		// we want to have the resizer always on lower right edge. So must deal
		// with different view orientations (readdirection etc)...
		// Like this ? seems to work so far

		var po = KMedViewer.getPermutationOrder();
		var flips = po.flips;
 		rw_diff._data[0] *= flips[0];
 		rw_diff._data[1] *= flips[1];
 		rw_diff._data[2] *= flips[2];


		if(that.shape == 'sphere')
		{
			var newsize = refsize + rw_diff._data[ findIndexOfGreatest(rw_diff._data) ];
		}
		else if(that.shape == 'box')
		{
			// unfortunately must deal with read direction etc
			/*
			var po = medViewer.nii.permutationOrder;
			var rd = medViewer.nii.readdirection;
			rw_diff._data[0] *= rd[0];
			rw_diff._data[1] *= rd[1];
			rw_diff._data[2] *= rd[2];
*/
	
			// we have a somewhat strange convention: box center point is in corner, 3druler center point is in center ...
			if(1 || that.type == '3druler')	
				var posshift =   math.multiply(rw_diff, -.50);
			else
				var posshift =   math.multiply(rw_diff, 0);

			var newpos = ( math.add(refpos, posshift ) );
			
			// check if lower right or upper left resizer
			if(edgeindex==0 )
				var dir = .5;
			else if(edgeindex==1 )
				var dir = -.5;
			var newsize = math.add(refsize , math.multiply(rw_diff, dir))._data;
			
			that.p.coords = newpos._data;
		}


		if(that.shape == 'scribble')
		{
			//var lengthPerSegment = 5; // in mm
			var lengthPerSegment = that.parentmarkerset.markerPanel.scribbleTool.lengthPerSegment
			var tlen = that.subpoints.length
			if(tlen == 0 )
			{
				that.subpoints.push(that.p.coords);
			}
			else
			{
				if(!that.isclosed)
					var lastpoint = that.getsubpoint(tlen-1); // .length ist costly, save in future!
				else
					var lastpoint = that.getsubpoint(that.lastInsertedPointInd); // .length ist costly, save in future!

				var difftolastpoint = ( math.add(lastpoint, math.multiply(rwpos_new,-1) ) );
				var difftolastpoint_norm =  math.norm(difftolastpoint);
				// add new point
				if(difftolastpoint_norm > lengthPerSegment)
				{

					var newcoords = rwpos_new._data ;

					if(that.isclosed)
					{
						/* if polygon is already closed, and we start dragging  need smart way to improve / correct polygon 
							1) remove any point which closer than segment length than the newly inserted point
							2) keep polygon tight: search closest point to inserted one. remove all points between (clip the path)
						*/
						// set the move directon after first anchor point

						if(that.movedirection == 0)
						{
							// from the lastInsertedPointInd, in which direction did we move ?
							// check left and right from lastInsertedPoint: in which direction did we move
							var dLastL = math.norm(kp_vsum(that.getsubpoint(that.lastInsertedPointInd-1), that.subpoints[that.lastInsertedPointInd], -1));
							var dLastR = math.norm(kp_vsum(that.getsubpoint(that.lastInsertedPointInd+1), that.subpoints[that.lastInsertedPointInd], -1));
							var dNewL  = math.norm(kp_vsum(that.getsubpoint(that.lastInsertedPointInd-1), newcoords, -1));
							var dNewR  = math.norm(kp_vsum(that.getsubpoint(that.lastInsertedPointInd+1), newcoords, -1));

							// are we going forward or backward along the path?
							//if(dLastL/dNewL > dLastR / dNewR)
							//if(Math.abs(dLastL-dNewL) < Math.abs(dLastR - dNewR))
							if( dLastL-dNewL  > dLastR - dNewR )
								that.movedirection = -1
							else
								that.movedirection = 1;
						}
						// insert new point
						var insertionInd = that.lastInsertedPointInd + (that.movedirection==1?1:0);
						that.subpoints.splice(insertionInd, 0, newcoords );
						that.lastInsertedPointInd  = insertionInd;

						// find the closest point to the one which was just inserted
						var dists = [];
						var looksteps = 8;
						looksteps = (tlen>looksteps*2)*looksteps

						for(var k=0; k < looksteps; k++)
						{
							var uind = that.lastInsertedPointInd + (k+1)*that.movedirection;
							dists.push( math.norm(kp_vsum( that.getsubpoint(uind)  , newcoords, -1) ) );
						}
						var toremove = kp_vec_min(dists).ind;
						//console.log("removing points: " + themin.ind + " starting from: " + that.lastInsertedPointInd)

						// take the shortes way, remove points

						if(that.movedirection == 1)
						{
							that.subpoints.splice(that.lastInsertedPointInd+1, toremove);
							if(that.lastInsertedPointInd+1+toremove > tlen  )
							{
								var fromzeroind =  toremove - (tlen - that.lastInsertedPointInd)
								that.subpoints.splice(0, fromzeroind);
								that.lastInsertedPointInd -= fromzeroind;
							}
						}
						else
						{
							// walked over first point?
							if(that.lastInsertedPointInd-toremove < 0  )
							{
								var toremove2 = (toremove-that.lastInsertedPointInd)
								that.subpoints.splice(tlen - toremove2+1, toremove2);
								toremove-=toremove2;
							}
							that.subpoints.splice(that.lastInsertedPointInd-toremove, toremove);
							that.lastInsertedPointInd -= toremove;
						}

					}
					else
					{
						that.subpoints.push( newcoords );
					}
				}
			}
			
			// close the scribble-polygon
			if(donotrecalcflag == 'recalc' && !that.isclosed)
			{
				//that.isclosed = 1;
				that.drawpoint();
			}
		}
		else
		{
			that.setsize( newsize, undefined, donotrecalcflag);
		}	

    }

    
    that.setcolor = function(color)
    {
        that.p.color = color || that.p.color;
        for(var mid in $markers)
        {
        	var css = that.p.color.getCSS();
		  // $markers[mid].css('border-color', css);
		   $markers[mid].find('.markerpoint_haircross_x').css('background', css);
		   $markers[mid].find('.markerpoint_haircross_y').css('background', css);
		   $markers[mid].find('.markerpoint_resizer').css('background', css);

		   if( that.shape == 'box')
				$markers[mid].find('line').css('stroke', css);
// 		   if( that.shape == '3druler')
// 			   $markers[mid].find('.markerpoint_3Druler_text').css('background', "rgba(" + that.p.color.color.slice(0,3).join(",") + ",.25)" );
		   if( that.shape == 'scribble')
		   {
			   var opac = that.p.color.length==4?that.p.color[3]/255:1;
			   $markers[mid].find('polyline').css('stroke', "rgba(" + that.p.color.color.slice(0,3).join(",") + ","+opac+")" );
		   }
        }
        that.drawpoint()
        that.runcallbacks('changeProps')

        if( that.parentmarkerset.type == 'pointROI' && that.roinii.fileObject) 
        {
			// we have this mess with colors being indices or rga or whatever
			// here, we need an index (a color number), so find it if necessary
            //var color = KColor.findColorIndex(that.p.color.color) ;    
            // --> check moved to setColorGlobal
			KViewer.roiTool.setColorGlobal(that.roinii.fileObject.fileID ,  that.p.color )
        }

    }

    /***************************************************************************************
    * set additional callbacks, for example from markerPanel for synchronity
    ****************************************************************************************/
	// no extension, direct pointer
	that.callbacks = $.extend(true, {}, KMarkerpoint_callbacks);
	
	that.setcallbacks = function(callbacks)
	{
		that.callbacks = $.extend(true, that.callbacks, callbacks)
	}
	
	// run a specified callback
	that.runcallbacks = function(c, varargin)
	{
		//var dummy = 1;
		//console.log(c);
 		for(var p in that.callbacks[c])
 		{
 			that.callbacks[c][p](that, varargin);
 		}
	}


    /***************************************************************************************
    * toggle visibility of this point
    ****************************************************************************************/
    that.togglepoint = function(state)
	{
		if(state !== undefined)
			that.visible = state;
		else
			that.visible = that.visible?false:true;
		
		if(that.visible) 
			 that.drawpoint();
	    else
  			 that.clearpoint();

        for (var x in that.onupdate)
            that.onupdate[x]();

  	
		that.runcallbacks('toggle');
	}

    that.select = function()
	{
		var ps = parentmarkerset.getPoints();


		var tcks = KViewer.findAllViews('fibers');
	//	for (var k = 0 ;k < tcks.length;k++)
	//		tcks[k].setAnnotationAssoc(parentmarkerset.uuid);

	    that.active = (that.active+2)%3 -1 ;
	    that.runcallbacks('active');

/*		for (var k = 0; k < ps.length;k++)
		{
			ps[k].active = (that==ps[k]);
			ps[k].runcallbacks('active');
		}
*/	
		if (parentmarkerset.simpanel)
			parentmarkerset.simpanel.updateActive()

	    for (var x in parentmarkerset.onupdate)
           parentmarkerset.onupdate[x]();
	    for (var x in that.onupdate)
           that.onupdate[x]();

	}


	/***************************************************************************************
	* draw this point in a all viewports, if they have a valid nifti
	****************************************************************************************/
	that.indrawing = -1;
	that.drawpoint = function()
	{
		if (that.parentmarkerset != undefined && Object.keys(that.parentmarkerset.markerpoints).length>10)
		{
			if (that.indrawing != -1)
			{
			 	clearTimeout(that.indrawing);
			 //   for (var x in that.$markers) that.$markers[x].css('display','none');
			}
			that.indrawing = setTimeout(draw,0);
	    }
	    else
	    	draw();

		function draw()
		{

			if (KViewer.viewports == undefined)
				return
			if (that.parentmarkerset.visible == false)
				return	

			
			KViewer.iterateMedViewers(function(medViewer)
			{
				if( medViewer.nii !== undefined && ( 
						     !medViewer.mosaicview.active && 
							 that.parentmarkerset.state.visible &&
							 that.visible &&
							 (KViewer.markerTool.enabled != 0  || ( that.parentmarkerset.markerPanel &&  that.parentmarkerset.markerPanel.panelvisible ) ) 
						)	
						|| that.type == 'ruler' 

					)
					{
						that.drawpoint_singleVP(medViewer.viewport);

					}

			});
			that.runcallbacks('move'); 
			for (var x in that.$markers) that.$markers[x].css('display','block')

			that.indrawing = -1;
		}
	
    }


    /***************************************************************************************
    * update name 
    ****************************************************************************************/
    that.changeName = function($e)
    {
		  that.p.name = $e.html();
		  if(that.p.name.replace(/\s*[<br\s*/>]/g, '') == "")
			 that.p.name = "noname";

		  //for(var mid in $markers)   {   $markers[mid].$name.html(that.p.name);      }
		  //that.callbacks.name.forEach( function(callback) {callback(that);} );
		  that.runcallbacks('changeProps');

    }




    /***************************************************************************************
    * draw this point in a single viewport: check if is there, if not create, else update
    ****************************************************************************************/
    that.drawpoint_singleVP = function(viewport)
    {
    		if (viewport != undefined)
    		{
				var medViewer = viewport.medViewer;
				// a unique marker id
				var mid = 'MARKER_' + viewport.viewPortID  + "_" +  that.uuid;

				if ( !medViewer.isGLenabled() )
				{
					drawpoint_2D(medViewer, mid)
				}
				else
				{
					drawpoint_3D(medViewer, mid)
				}
    		}
    }

 	/***************************************************************************************
    * point in 2D VP
    ****************************************************************************************/
	
    function drawpoint_2D(medViewer, mid)
    {
	
	    var canvascoords = medViewer.getCanvasCoordinates(that.p.coords);

        // must create a new marker one if not exists
        if($markers[mid] === undefined )
        {
			//var $a;
			if(that.parentmarkerset.state.zIndex)
				var addstyle ="style='z-index: " + that.parentmarkerset.state.zIndex + "'";
			else
				var addstyle = "";
			
			var $a = $("<div uid='" + mid + "' "+addstyle+" class=''></div>"); 
            
            // special "OLD" classes ruler and rectangles
            if (that.type == 'ruler' | that.type == 'rectangles')
            {
				if (that.type == 'ruler')
				{
					//var $a = $("<div uid='" + mid + "' class='markerruler'></div>");
					$a.addClass("markerruler") 
					$a.$term_a = $("<div class='markerruler_terminal markerruler_terminal_a'  ></div>").appendTo($a)
					$a.$term_b = $("<div class='markerruler_terminal markerruler_terminal_b'  ></div>").appendTo($a)
					$a.$text = $("<div class='markerruler_text' > <span></span> <i class='fa fa-trash'></i></div>").appendTo($a)
					$a.$textspan = $a.$text.find("span");
					$a.$trash = $a.$text.find("i");
					$a.$trash.on("click",function()	{ that.deletepoint(); });

				}
				else if (that.type == 'rectangles')
				{
					//var $a = $("<div uid='" + mid + "' class='markerrectangle'></div>"); 
					$a.addClass("markerrectangle") 
					$a.$term_a = $("<div class='markerruler_terminal markerruler_terminal_a rect_term' ></div>").appendTo($a)
					$a.$term_b = $("<div class='markerruler_terminal markerruler_terminal_b rect_term' ></div>").appendTo($a)
					$a.$rect = $("<div class='markerrectangle_rectborder' ></div>").appendTo($a)
				}

				attachRulerHandlers($a);
			}
            else // the normal generic class
            {
	            if(that.shape == 'sphere')
	            {
					$a.addClass("markerpoint") 
					$a.append(  $("<div class='markerpoint_haircross_x' style='background:"+ that.p.color.getCSS() +"'></div>") );
					$a.append(  $("<div class='markerpoint_haircross_y' style='background:" + that.p.color.getCSS() + "; '></div>") );
					
					if (that.master && that.parentmarkerset.showTrash)
					{
						if (that.parentmarkerset.showTrash)
							$a.append( $("<span><i class='markerpoint_trash fa fa-trash'></i></span>").click(function(){
							markerProxy.delSet(that.parentmarkerset.uuid)
							} ));
					}

					if (that.parentmarkerset.optionalFunction)
					{
						$a.append( $("<span><i class='markerpoint_trash fa "+that.parentmarkerset.optionalFunction.icon+"'></i></span>").click(function(){
						that.parentmarkerset.optionalFunction.operation(that.parentmarkerset);
						} ));
					}



					if(that.type=='pointROI' || that.parentmarkerset.state.showresizer)
						$a.$resizerB = $("<div class='markerpoint_resizer_sphere' style=''></div>").appendTo($a);
					if(that.type=='pointROI')
					{
						//that.parentmarkerset.markerPanel.clone().appendTo($a)
						$a.$resizerZ = $("<div class='markerpoint_thresh_slider' style=''></div>").appendTo($a);
						 attachMouseSlider($a.$resizerZ, {
								mousedown: function(ev, dx, dy, mousedownvar) { return {startval: that.thresh  } },
								mousemove: function(ev, dx, dy, mousedownvar) {
								   var newval = (mousedownvar.startval + 1 * -dy *200);
								   newval = math.round(newval)
								   that.thresh = newval;
								   return {wasinrange:1, value: newval }
								},
								mouseup: function(){
									that.onupdate.pointROI();
									if(that.parentmarkerset.markerPanel)
									{
										var dummy = that.parentmarkerset.markerPanel.$markerListTable.children('[marker_uuid="'+that.uuid+'"]');
										if(dummy.length>0 && dummy.find('input').length > 0)
											dummy.find('input').val(that.thresh);
									}
									} } 
							);						
					}

	            }
	            else if(that.shape == 'box' && that.type != '3druler')
	            {
					$a.addClass("markerrectangle markerpoint_box") 
					$a.$resizerB = $("<div class='markerpoint_resizer_box' style=''></div>").appendTo($a);
	            }
	            
	            if(that.type == '3druler')
	            {
					$a.addClass("markerpoint markerpoint_3Druler") 
					$a.$resizerA = $("<div class='markerpoint_resizer markerpoint_3Druler_resizer'></div>").appendTo($a);
					$a.$resizerB = $("<div class='markerpoint_resizer markerpoint_3Druler_resizer markerpoint_resizer_other'></div>").appendTo($a);
					
					$a.$rulertext = $("<div class='markerpoint_3Druler_text'></div>").appendTo($a);
					$a.$rulertextInner = $("<span class=''></span>").appendTo($a.$rulertext);
					$a.$delete = $("<span><i class='markerpoint_trash fa fa-trash'></i></span>").appendTo($a.$rulertext).click(function(){that.deletepoint()});
					if(that.parentmarkerset.state.locked)
						$a.$delete.hide();

					if (that.parentmarkerset.optionalFunction)
					{
						$a.append( $("<span><i class='markerpoint_trash fa "+that.parentmarkerset.optionalFunction.icon+"'></i></span>").click(function(){
						that.parentmarkerset.optionalFunction.operation(that.parentmarkerset);
						} ));
					}


					$a.$rulersvg = $("<svg version='1.1' viewBox='-1 -1  1 1' preserveAspectRatio='none'><line x1='-1' x2='1' y1='-1' y2='1' style=''></svg>").appendTo($a);
	            }

	            if(that.type == 'scribble')
	            {
					$a.addClass("markerpoint markerpoint_scribble") 
					$a.$comment = $("<div class='markerpoint_comment'></div>").appendTo($a);
					$a.$delete = $("<span><i class='markerpoint_trash fa fa-trash'></i></span>").appendTo($a).click(function(){that.deletepoint()});
					$a.$closescribble = $("<span><i class='markerpoint_trash fa fa-circle-o'></i></span>").appendTo($a).click(function(){that.closescribble()});

					if (that.parentmarkerset.optionalFunction)
					{
						$a.append( $("<span><i class='markerpoint_trash fa "+that.parentmarkerset.optionalFunction.icon+"'></i></span>").click(function(){
						that.parentmarkerset.optionalFunction.operation(that.parentmarkerset);
						} ));
					}

					if(that.parentmarkerset.state.locked)
						$a.$delete.hide();

					var pstr = '0,0,1,1';
					var childstr = "<polyline id='scribblepolygon' points='" + pstr + "' />";

					var cstr = "<g class='scribble_circles' ></g>";
					childstr +=  cstr;

					var gaussblur = 1;
					var defs = "<defs><filter id='svg_blur'> <feGaussianBlur stdDeviation='"+gaussblur +"' /> </filter> </defs>";
					//$a.$scribblesvg = $("<svg version='1.1' viewBox='-1 -1  1 1' preserveAspectRatio='none'>" + defs + childstr + "</svg>").appendTo($a);
					$a.$scribblesvg = $("<svg version='1.1' _viewBox='-1 -1  1 1' _preserveAspectRatio='none'>" + defs + childstr + "</svg>").appendTo($a);
					$a.$scribblepolyline = $a.$scribblesvg.find('polyline');
					$a.$scribblecirclegroup = $a.$scribblesvg.find('.scribble_circles');
				
	            }




				// version with creation hover elements on demand: perform creation in hover function
				if( !recreateInfoBoxOnHover)
				{
					 var $props = $("<div class='markerpoint_props' style='visibility:hidden'></div>");
					 var thingstoshow = {colorsel:1, id:1, name:1, toggle:0, search:0, delete:1,  coords:1,comment:1};
				 	 $props.append( that.createMarkerRepresentation('self' + mid, thingstoshow ) ).appendTo($a);
					 that.runcallbacks('createinfobox', $props);
				}

				// ?? sethover_singleVP is also set in createMarker  but probably we need, this, eg if new viewport is created
				sethover_singleVP($a, {locked: that.parentmarkerset.state.locked, hoverdetails:that.parentmarkerset.state.hoverdetails });
       	    }
		
			
            
    
    		$a.medViewer = medViewer;
			
            medViewer.$canvascontainer.append($a);
            $markers[mid] = $a;


        }

    	// calc apparent size in this slice
    	if(that.shape == 'sphere')
    	{
    		var size_true_x =  that.p.size;
    		var size_true_y =  that.p.size;
			var size_apparent_x  = math.sqrt(math.pow(size_true_x,2) - math.pow(canvascoords.z_mm - medViewer.getCurrentSliceInMM(),2) ) *canvascoords.x_pixPerMM * 2;
			var size_apparent_y  = size_apparent_x;
			
			var isInside = size_apparent_y >0;
			
			if(!isInside && that.shape != 'scribble')
			{
				var minrad = 2;
				var size_apparent_x = math.min(size_true_x, minrad) ;
				var size_apparent_y = math.min(size_true_y, minrad) ;
			}

    	}
    	else if(that.shape == 'box' )
    	{
    		var plu = medViewer.getCanvasCoordinates( math.add(that.p.coords, that.p.size)._data );
    		var prd = medViewer.getCanvasCoordinates( math.add(that.p.coords, math.multiply(that.p.size, -1))._data );

    		var size_true_x =  math.abs(plu.x_pix - prd.x_pix)*1;
			var size_true_y =  math.abs(plu.y_pix - prd.y_pix)*1;
    		
    		var size_apparent_x = size_true_x;
    		var size_apparent_y = size_true_y;

			var zz = medViewer.getCurrentSliceInMM();
			var isInside  =  zz > Math.min(plu.z_mm, prd.z_mm) && zz < Math.max(plu.z_mm, prd.z_mm)

			
			var dy = (plu.y_pix-prd.y_pix)/plu.y_pixPerMM ;
			var dx = (plu.x_pix-prd.x_pix)/plu.x_pixPerMM;
			var yf = dy>0?-1:1;
			var xf = dx>0?-1:1;
			var ss = 50;
			//var ss = 0;
			$markers[mid].css('transform','scale('+xf+','+yf+') translate('+(-xf*ss)+'%,'+(-yf*ss)+'%)');
  			if(that.type == '3druler')
			{
				if($markers[mid].$rulertext)
				{
					$markers[mid].$rulertext.css('transform','scale('+xf+','+yf+') translate('+(-xf*ss)+'%,'+(-yf*0)+'%)');
					var inPlaneLength = Math.sqrt( dy*dy + dx*dx );
					$markers[mid].$rulertextInner.text(inPlaneLength.toFixed(1) + ' mm');
				}
				// ruler:show always
				isInside  = true;
			}
    	}
    	else if(that.shape == 'scribble')
    	{
    		size_true_x = .1;
			//var test  = math.sqrt(math.pow(size_true_x,2) - math.pow(canvascoords.z_mm - medViewer.getCurrentSliceInMM(),2) ) *canvascoords.x_pixPerMM * 2;
			var test  = math.abs(canvascoords.z_mm - medViewer.getCurrentSliceInMM()) 
			var isInside = test < medViewer.nii.voxSize[medViewer.getSlicingDimOfArray()]*.3;    		
			size_apparent_x = 3;
			size_apparent_y = 3;
    	}
    	
		// this should go down, firstcondition etc
    	if(that.parentmarkerset.type == 'scribble')
    	{

			var pstr = "";
			
			$markers[mid].$scribblecirclegroup.empty();
			var cstr = "";

			for (var i = 0; i < that.subpoints.length; i++)
			{
				var cc = medViewer.getCanvasCoordinates(that.subpoints[i]); 
				var dx =cc.x_pix- canvascoords.x_pix;
				var dy =cc.y_pix- canvascoords.y_pix;
				pstr +=  dx.toFixed(2) + ',' + dy.toFixed(2) + " " 
				var circleradius = 5;
				cstr = cstr + "<circle class='polygonCircle' ind =" + i + " cx=" + dx.toFixed(2) + " cy=" + dy.toFixed(2) + " r=" + circleradius + " fill='"+that.p.color.getCSS()+"' stroke-width=" + 0 + "/>";
			}
			// add very first point to close scribble
			if(that.subpoints.length > 0 && that.isclosed )
			{
				var cc = medViewer.getCanvasCoordinates(that.subpoints[0]); 
				var dx =cc.x_pix- canvascoords.x_pix; var dy =cc.y_pix- canvascoords.y_pix;
				pstr +=  dx.toFixed(2) + ',' + dy.toFixed(2) + " " 
			}

			$markers[mid].$scribblecirclegroup.html(cstr)
			
			/**************************/
			// subpoint handling
			var $circles = $markers[mid].$scribblecirclegroup.children();

			for (var k = 0; k < $circles.length; k++)
				$circles.eq(k).mousedown(cmousedown).mouseover(cmouseover).mouseout(cmouseout)

			// mouse handler for the single points
			function cmouseover(ev) { ev.target.setAttribute('r', circleradius * 1.3); }
			function cmouseout(ev) { ev.target.setAttribute('r', circleradius); }

			function cmousedown(ev, ev2)
			{
				if (ev2 !== undefined)
					ev = ev2;
				// delete with right click
				if (ev.button == 2)
				{
					var pindex = parseInt(this.getAttribute('ind'))
					// cannot delet first point
 					if(pindex == 0)//that.subpoints.length-1)
 					{
 						alertify.error('cannot delete first point')
 						return false
 					}

					that.subpoints.splice(pindex, 1);

					cmouseup(ev);
					that.drawpoint();
					ev.stopPropagation(); return false;
				}

				var pindex = parseInt(this.getAttribute('ind'));
				//var startpos = [parseInt(this.getAttribute('cx')) - ev.clientX, parseInt(this.getAttribute('cy')) - ev.clientY];
				var $a = $markers[mid];
				var cc = medViewer.getCanvasCoordinates(that.subpoints[pindex]);
				var startpos = [ev.clientX - $a.offset().left - 0*cc.x_pix, ev.clientY - $a.offset().top - cc.y_pix ];

				$(document).on("mousemove", function(ev) { cmousemove(ev, pindex, startpos)  });
				$(document).on("mouseup mouseleave", cmouseup);
				$circles = $markers[mid].$scribblecirclegroup.children();
				ev.stopPropagation(); 
				return false;
			}

			function cmousemove(ev, pindex, startpos)
			{

				var newX = startpos[0] + ev.clientX;
				var newY = startpos[1] + ev.clientY;
				//var p = medViewer.getRealWorldCoordinatesFromMouseEvent(ev.clientX - startpos[0]  , ev.clientY - startpos[1]);
				var p = medViewer.getRealWorldCoordinatesFromMouseEvent(ev.clientX, ev.clientY);

				that.subpoints[pindex] = p._data;
				//that.drawpoint();
				var cc = medViewer.getCanvasCoordinates(that.subpoints[pindex]); 
				var dx =cc.x_pix- canvascoords.x_pix;
				var dy =cc.y_pix- canvascoords.y_pix;
				$circles.eq(pindex).attr('cx', dx).attr('cy', dy);

				var pstr = "";
				var tlen = that.subpoints.length;
				var cc, dx
				for (var i = 0; i < tlen; i++)
				{
					cc = medViewer.getCanvasCoordinates(that.subpoints[i]); 
					dx =cc.x_pix- canvascoords.x_pix; var dy =cc.y_pix- canvascoords.y_pix;
					pstr +=  dx.toFixed(2) + ',' + dy.toFixed(2) + " " 
				}
				// add very first point to close scribble
				if(tlen > 0 && that.isclosed )
				{
					cc = medViewer.getCanvasCoordinates(that.subpoints[0]); 
					dx =cc.x_pix- canvascoords.x_pix; var dy =cc.y_pix- canvascoords.y_pix;
					pstr +=  dx.toFixed(2) + ',' + dy.toFixed(2) + " " 
				}
				
				$markers[mid].$scribblepolyline.attr('points', pstr);
				if(pindex == that.subpoints.length-1)
					cmousemove(ev, 0, startpos);
				ev.stopPropagation(); return false;
			}

			function cmouseup(ev) { $(document).off("mousemove mouseup mouseleave"); ev.stopPropagation(); return false; }

			/**************************/

			
			$markers[mid].$scribblepolyline.attr('points', pstr);
			var opacity = (isInside)?that.p.color.getOpacity():0.4;
			$markers[mid].$scribblepolyline.css({stroke: that.p.color.getCSS(), opacity:opacity })

    	}


		var firstcondition = true;

		if( that.parentmarkerset.state.showOnAllImages == 0 && that.referencedImageFilename != medViewer.getFullFilename())
			firstcondition = false;

		
	
	    //if(  firstcondition && ( ( size_apparent_x >= 0  && size_apparent_y >= 0   ) ) | that.parentmarkerset.state.showThroughSlice)
	    if(  firstcondition &&  ( isInside | that.parentmarkerset.state.showThroughSlice) )
	    {
	    	if( isInside )
	    	{
				var opac = 1; //siz_apparent / siz_true;
				var thick = (1 + 3 * (opac>.95));
	    	}
	    	else
	    	{
				var opac = 0.3;
				var thick = 3;
	    	}

			$markers[mid].css( {
				left:canvascoords.x_pix+'px', 
				top:canvascoords.y_pix+'px', 
				borderColor: that.p.color.getCSS(), 
				opacity:opac, 
				borderWidth:thick 
				} );
			
			// unfortunately, must reset color here every time, due to drawing with timeouts
			if($markers[mid].$resizerA)
				$markers[mid].$resizerA.css('background', that.p.color.getCSS());
			if($markers[mid].$resizerB)
				$markers[mid].$resizerB.css('background', that.p.color.getCSS());

		    
		    if(that.type == 'ruler' | that.type == 'rectangles')
		    {
		    	var dir = that.dir;
				var l = Math.sqrt(dir[0]*dir[0]+dir[1]*dir[1]);
				var deg = Math.atan2(-dir[1],-dir[0])/Math.PI*180;
		    	$markers[mid].css( {width:l*canvascoords.x_pixPerMM+"px", transform:"translate(-50%,-50%) rotate("+deg+"deg)" });
		    	if (that.type == 'ruler')
		    	{
		    		$markers[mid].$textspan.text(l.toFixed(1)+"mm")
		    		$markers[mid].css( {background:  that.p.color.getCSS(),
											  borderColor: that.p.color.getCSS()});
		    		$markers[mid].$term_a.css( {background:  that.p.color.getCSS(),
											  borderColor: that.p.color.getCSS()});
		    		$markers[mid].$term_b.css( {background:  that.p.color.getCSS(),
											  borderColor: that.p.color.getCSS()});
		    	}
		    	else if (that.type == 'rectangles')
		    	{
					deg = 90-deg;
					$markers[mid].$rect.css( {width:Math.abs(canvascoords.x_pixPerMM*dir[1])+"px",
											  height:Math.abs(canvascoords.x_pixPerMM*dir[0])+"px",
											  //background:  that.p.color.getCSS(),
											  borderColor: that.p.color.getCSS(),
											  left:(-Math.abs(dir[1])+l)*canvascoords.x_pixPerMM/2+"px",
											  top:-Math.abs(dir[0])*canvascoords.x_pixPerMM/2+"px",
											  transform:"translate(0%,0%) rotate("+deg+"deg)"});
					$markers[mid].$term_a.css({ background: that.p.color.getCSS()  });
					$markers[mid].$term_b.css({ background: that.p.color.getCSS()  });
		    	}

		    }   
		    else
		    {
		    	$markers[mid].css( {width: size_apparent_x , height:  size_apparent_y })
		    }

	    }
	    else
	    {
			var siz = -2;
			var opac = 0;
			canvascoords.x_norm = -1000;               canvascoords.y_norm = -1000;
			$markers[mid].css( {left:canvascoords.x_norm*100+'%', top:canvascoords.y_norm*100+'%', width:siz, height:siz, borderColor: that.p.color.getCSS()} );
	    }

        
    }


    /***************************************************************************************
    * a general marker representation (coordinates, properties, callbacks)
    ****************************************************************************************/
	that.createMarkerRepresentation = function(targetid, thingstoshow)
	{
		var point = that;

		// the shown fields for this representation can be set here.
		var fields = {radius:1,economy:0, colorsel:1, id:1, name:1, pointROI: 0, toggle:1, search:1, delete:0, active:0, coords:1,coords_transformed:0};
		$.extend(true, fields, thingstoshow )

		var $box  = $("<div class='markerpointrow'></div>").on('onmouseenter', point.onHoverEnter ).on('onmouseleave', point.onHoverLeave );
		var $row1  = $("<div class='markerpointrow_info'></div>").appendTo($box);


		///////////////// the coordinates fields ////////////////////////////////////
		if(fields.coords)
		{		
			function updateInputsC(which)
			{
				return function(ev) { updateInputs(which); ev.stopPropagation();return false; }
			}

			var $row2;
			if (fields.economy)
				$row2 = $row1;
			else
			    $row2  = $("<div class='markerpointrow_coords'></div>").appendTo($box);
			var $coords = $("<div class='markerpoint_coords' ></div>").appendTo($row2);
				 //var $innercords = $("<div class='' ></div>").appendTo($coords);
				 var $innercords = $coords;
				 $innercords.append( $("<div><input type = 'number' value='"+ point.p.coords[0].toFixed(1) +"' /></div>").on('change', updateInputsC(0)) );
				 $innercords.append( $("<div><input type = 'number' value='"+ point.p.coords[1].toFixed(1) +"' /></div>").on('change', updateInputsC(0)) );						
				 $innercords.append( $("<div><input type = 'number' value='"+ point.p.coords[2].toFixed(1) +"' /></div>").on('change', updateInputsC(0)) );
			if (fields.radius)
			{
				if(that.shape =='sphere')
				{
					var sizestring = point.p.size.toFixed(1);
				 	$innercords.append( $("<div><input type = 'number' value='"+ sizestring +"' /></div>").on('change', updateInputsC(3)) );
				}
				else if(that.shape == 'box')
				{
					var sizestring = point.p.size[0].toFixed(1) + "," + point.p.size[1].toFixed(1) + "," + point.p.size[2].toFixed(1);
				 	$innercords.append( $("<div><input type = 'text' value='"+ sizestring +"' /></div>").on('change', updateInputsC(3)) );
				}

			}
		    if (fields.coords_transformed && KViewer.reorientationMatrix.notID)
		    {
				 $coords.append( $("<br>") );
				 //var $inner = $("<div class='' ></div>").appendTo($coords);
				 var coords = markerProxy.to_transformed(point.p.coords  )._data
				 var $inner = $coords;
				 $inner.append( $("<div><input type = 'number' value='"+ coords[0].toFixed(1) +"' /></div>").on('change', updateInputsC(1)) );
				 $inner.append( $("<div><input type = 'number' value='"+ coords[1].toFixed(1) +"' /></div>").on('change', updateInputsC(1)) );
				 $inner.append( $("<div><input type = 'number' value='"+ coords[2].toFixed(1) +"' /></div>").on('change', updateInputsC(1)) );
		    }
		    if (fields.comment)
		    {
				 $coords.append( $("<br>") );
				 //var $inner = $("<div class='' ></div>").appendTo($coords);
				 var $inner = $coords;
				 $inner.append( $("<div><input class='pointcomment' type = 'text' placeholder='a comment' value='"+ point.p.comment +"' /></div>").on('change', updateInputsC(2)) );		    	
		    }
			var $inputs = $coords.find("input");  

			function updateInputs(which)
			{
				 var coords;
				 if (which == 0)
				 {
				    coords = [ parseFloat( $inputs[0].value), parseFloat( $inputs[1].value ), parseFloat( $inputs[2].value ),1   ];
			  	    point.movepoint(coords);
				 }
				 else if (which == 1)
				 { 
				    coords = [ parseFloat( $inputs[4].value), parseFloat( $inputs[5].value ), parseFloat( $inputs[6].value ),1   ];
				    coords = markerProxy.to_transformed(coords)._data
			  	    point.movepoint(coords);
				 }
				 else if (which == 3)
					 point.setsize( parseFloat( $inputs[3].value)  );
				 else if (which == 2)
				 {
				 	   point.p.comment = $coords.find(".pointcomment").eq(0).val();
				 	   that.runcallbacks('changeProps')
				 }

				if(!point.parentmarkerset.state.ignoremodified)
				{
					 markerProxy.modified = true;
					 point.parentmarkerset.modified = true;
				}

			}

			point.callbacks.move[targetid] = function()
			{     
					if(that.shape =='sphere')
						var sizestring = point.p.size.toFixed(1);
					else if(that.shape =='box')
						var sizestring = point.p.size[0].toFixed(1) + "," + point.p.size[1].toFixed(1) + "," + point.p.size[2].toFixed(1);

				  $inputs.eq(0).val(point.p.coords[0].toFixed(1))
				  $inputs.eq(1).val(point.p.coords[1].toFixed(1))
				  $inputs.eq(2).val(point.p.coords[2].toFixed(1))
				  $inputs.eq(3).val( sizestring )
 				  if (fields.coords_transformed &&  KViewer.reorientationMatrix.notID)
				  {
					  var coords_transformed =  markerProxy.to_transformed(point.p.coords   );
					  $inputs.eq(4).val(coords_transformed._data[0].toFixed(1))
					  $inputs.eq(5).val(coords_transformed._data[1].toFixed(1))
					  $inputs.eq(6).val(coords_transformed._data[2].toFixed(1))
					  /*if (KViewer.reorientationMatrix.notID)
					  {
					  	$inputs.eq(4).show();
					  	$inputs.eq(5).show();
					  	$inputs.eq(6).show();
					  }
					  else
					  {
					  	$inputs.eq(4).hide();
					  	$inputs.eq(5).hide();
					  	$inputs.eq(6).hide();

					  }*/

				  }
				//  markerProxy.modified = true;
			}

			if (that.parentmarkerset.type == 'electrode' && that.isContact)
			{
				
				var voltage = (point.p.voltage == undefined)?"":point.p.voltage.toFixed(2);
				$coords.append( $("<div class='DBS_simindicator'> simulation </div><input class='DBS_nosimindicator' value='"+voltage+"' type = 'number' placeholder='voltage' min=0 max=50 />").on('change',function(e)
				{
					var voltage = parseFloat(e.target.value)
					if (isNaN(voltage))
					{
						point.p.voltage = undefined
						point.setsize( 1);
					}
				    else
				    {
						var impedance = that.parentmarkerset.electrode_properties.impedance;
						var k = that.parentmarkerset.electrode_properties.approx_maedler;
						function approx(r,imp)
						{
							return k[0]*0 + k[1]*r + k[4]*r*imp + k[3]*r*r + k[2]*imp + k[5]*imp*imp;
						}
						if (voltage > 0 && voltage < 20)
							var radius = binsearch(function(x) { return approx(x,impedance)},Math.abs(voltage),0,20,0.01);
						else
							var radius = 1;
						point.p.voltage = voltage
						point.setsize( radius );
				    }
					e.stopPropagation();
					return false;
				}));
				that.sim_indicator = $innercords.find(".DBS_simindicator").hide();
				that.voltage_indicator = $innercords.find(".DBS_nosimindicator");
				that.sim_indicator.on("mouseenter",function(e)
				{					
					if (that.showSimInfo != undefined)
					{
						var $info = that.showSimInfo(e);						
						$(this).on("mouseleave",function($d) { return function()
						{
							$d.remove() } }($info));
					}
				});
			}


		}




		if(fields.colorsel)		
			var	$colorselector = KColorSelectorSimple($("<div class='markerpointrow_colorselector'></div>"), point.setcolor, point.p).appendTo($row1);

		if(fields.name)
		{		
			var $name = $("<div contenteditable='true'>"+point.p.name+"</div>").appendTo($row1);
			KSetContentEditable( $name, point.changeName  );
			$name.click(function(){ document.execCommand("selectall",null,false);});
			point.callbacks.changeProps[targetid] = function()
			{
				// only reset if default name was auto --reset
				if($name.html() != point.p.name)
					$name.html(point.p.name);

				// set color of selector	
  	    	 	$colorselector.css('background', point.p.color.getCSS());
 	    	 	
  	    	 	var $comment = $box.find(".pointcomment");
  	    	 	if ($comment.length>0)
  	    	 		$comment.eq(0).val(point.p.comment);
			}
		}
			
		// tools at the right hand side
		var $tools = $("<div class='markerpointrow_tools'></div>").appendTo($row1);
		


	   if (fields.active)
		{		
	        var $active = $("<i class='fa fa-circle-o'></i>").appendTooltip('activepoint')
	        	.click(  function()
	        		{
	        			//that.markerPanel.setCurrentSet(point.parentmarkerset);
	        	//		markerProxy.setCurrentSet(that.parentmarkerset, true);
	        			point.select()

	        		}).appendTo($tools);
			point.callbacks.active[targetid] = function(point)
			{
				if(point.active == 0)
					 $active.addClass("fa-circle-o").removeClass("fa-circle").css('color', 'white');
				else if(point.active == -1)
					 $active.removeClass("fa-circle-o").addClass("fa-circle").css('color', 'yellow');
				if(point.active == 1)
					 $active.removeClass("fa-circle-o").addClass("fa-circle").css('color', 'red');
			}
			point.callbacks.active[targetid](point);
		}

		if(fields.toggle)
		{		
	        var $toggle = $("<i class='fa fa-eye'></i>").appendTooltip('showhidemarkerpoint').click(  function(){point.togglepoint()}   ).appendTo($tools);
			point.callbacks.toggle[targetid] = function(point)
			{
				if(point.visible)
					 $toggle.addClass("fa-eye").removeClass("fa-eye-slash").css('color', '');
				else
					 $toggle.removeClass("fa-eye").addClass("fa-eye-slash").css('color', '');
			}
			point.callbacks.toggle[targetid](point);
		}



		if(fields.search)		
        	var $search = $("<i class='fa fa-binoculars'' style='font-size:12px'></i>").appendTooltip("jumptopoint").mousedown( point.jumpToPoint ).appendTo($tools); 
    	if(fields.delete)		
	        var $delete = $("<i class ='fa fa-trash '></i>").appendTooltip('deletemarkerpoint').click( point.deletepoint   ).appendTo($tools);
		 
    	if(point.type =='pointROI')
    	{
    		if(point.thresh != undefined)
    			var thresh = point.thresh;
    		else
    			var thresh = that.parentmarkerset.state.pointROIthresh;

			var $thresh =  $("<input style='display:inline' type = 'text' min='0' step=1 value='"+thresh+"' /> ").appendTo($tools).on('change', 
				function (ev) {	point.onupdate.pointROI(undefined,undefined, parseFloat($thresh.val()) ) });
			KMouseSlider( $thresh, {min:-Infinity, incrementPerPixel: 1,  updateonmove: 0, updateonrelease: 1,  hideCurrentval: 0});
    	}
		
		
		point.callbacks.delete[targetid] = function()
		{
			$box.remove();
		}

		return $box;
	}



 




    /***************************************************************************************
    * point in 3D VP
    ****************************************************************************************/
	var glmesh = {};
	that.glmesh =glmesh;
    function drawpoint_3D(medViewer, mid)
    {
    	  if(medViewer.viewport.pointROIviewer == undefined)
    	  {
			  //var col = hexToRgb(that.p.color);
			  if (glmesh[mid] == undefined )
			  {
					glmesh[mid] = medViewer.gl.createMarkerMesh(that);
					glmesh[mid].viewer = medViewer;
					medViewer.gl.activateRenderLoop();

			  }
			  else
			  {
					glmesh[mid].setpoint(that);
			  }
    	  }
    	  else
    	  {
    	  	 if (glmesh[mid] != undefined)
    	  	 {
    	  	 	glmesh[mid].dispose();
    	  	 	glmesh[mid] = undefined;
    	  	 }
    	  }
    }
            
                        




    /***************************************************************************************
    * point jump
    ****************************************************************************************/

     that.jumpToPoint = function(ev)
     {
          // do not set to current set on point search.
          //markerProxy.setCurrentSet( that.parentmarkerset, false )

          KViewer.currentPoint = math.matrix(that.p.coords);
          //signalhandler.send("positionChange");
		  // on right click, center view around point
		  if(ev.button != 0)
          	signalhandler.send("positionChange centralize");
          else
          	signalhandler.send("positionChange");
          
          that.runcallbacks('jumptopoint');
     }



    /***************************************************************************************
    * event handlers
    ****************************************************************************************/

	that.sethover = function(state)
	{
		 if (state.locked != undefined)
		 	that.locked = state.locked;
		 for(var mid in $markers)   
		 {   
		 	sethover_singleVP($markers[mid], state)
		 }

	}
	
	function sethover_singleVP($a, state)
	{
	
		//  no hover for the scribble, makes no sense
		if($a.$scribblesvg != undefined )
			return;

		var lastScrollEvent 
		
		if(state.locked == false)
		{
			function MouseWheelHandler(ev)
			{
				ev = ev.originalEvent || ev;
				if (!ev.shiftKey | that.parentmarkerset.state.fixedsize)
					return;
				var amount = (ev.wheelDelta || -ev.detail ) > 0?1:-1;
				that.incsize( amount, $a.medViewer );
				that.drawpoint();
				
				// should be done with timeout in order not
				if (that.roinii && that.roinii.fileObject)
				{
					lastScrollEvent = Date.now();
					var deadtime = 300;
					window.setTimeout(function(){
					if(Date.now() - lastScrollEvent >= deadtime-1) 
					{
				   	//	signalhandler.send("updateImage",{id:that.roinii.fileObject.fileID});
				   	//	KViewer.roiTool.update3D(that.roinii.fileObject);
					}

				}, deadtime)
				}

				ev.preventDefault();
				ev.stopPropagation();
				return false;
			}

			/* move handler to move point */
			function mousedown(ev) 
			{
				if (state.locked == true)
				{		
					KViewer.currentPoint = math.matrix(that.p.coords);
					signalhandler.send("pointChanged");   
					return;
				}

				// set the 3D roi so that surface is calculated in 3D roi is shown
				if(that.parentmarkerset.type == 'pointROI' && that.roinii && that.roinii.fileObject)
				{
					if(ev.which ==  1)
						that.roinii.setThisPointInto3DView();
				}

				var startdiff = [ev.clientX - $a.offset().left - $a.width()/2 - 4, ev.clientY - $a.offset().top - $a.height()/2 -4 ];
				

				var worlddiff = math.add(math.multiply($a.medViewer.getRealWorldCoordinatesFromMouseEvent($a.offset().left + $a.width()/2 + 4,+ $a.offset().top + $a.height()/2 +4 ),-1),
									that.p.coords);



				// shift key ==> change point size 
				if(ev.shiftKey)
				{
					  var start = [ev.clientX ,  ev.clientY];
					  var startsize = that.p.size;
					  var canvascoords = $a.medViewer.getCanvasCoordinates(that.p.coords);

					  var mousemovehandler = moveUnlagger(function(ev2)
					  {
							var diff = ev2.clientY - start[1];
							that.setsize( startsize - diff / canvascoords.x_pixPerMM *1  );
							that.drawpoint();
							return false; 
					  })
					  $(document.body).on('mousemove', mousemovehandler);
					  $(document.body).on('mouseup',   function(ev2){$(document.body).off('mouseup mousemove mouseleave',mousemovehandler) }  );
					  $(document.body).on('mouseleave',   function(ev2){$(document.body).off('mouseup mousemove mouseleave',mousemovehandler) }  );
					  return false; 
					
				}
				// right click delete
   			 	if(ev.buttons == 2)	
				{
					that.deletepoint();
					ev.stopPropagation(); 
					return false;
				} 
				//left click
				else
				{
					 var mousemovehandler = moveUnlagger(function(ev2)
					 {
						if ($a.medViewer.nii)
						{
							var p = $a.medViewer.getRealWorldCoordinatesFromMouseEvent(ev2.clientX - startdiff[0]  , ev2.clientY - startdiff[1]);
							if (that.parentmarkerset.state.showThroughSlice)
								p = math.add(p,worlddiff);
							that.movepoint( p._data, $a.medViewer, ev2 );
							 ev2.stopPropagation();return false; 
						}
					 });
					 var mouseuphandler =  function(ev2){
						 	if ( that.roinii && that.roinii.fileObject  )
						 	{
						 		
						 		that.onupdate.pointROI( $a.medViewer )
						 	    //signalhandler.send("updateImage",{id:that.roinii.fileObject.fileID});
						 	}
						 	$a.medViewer.$container.off('mousemove',mousemovehandler)
						 	$a.medViewer.$container.off('mouseup',mouseuphandler)
						 	$a.medViewer.$container.off('mouseleave',mouseuphandler)
					 	 }  
					 $a.medViewer.$container.on('mousemove', mousemovehandler);
					 $a.medViewer.$container.on('mouseup',   mouseuphandler);
					 $a.medViewer.$container.on('mouseleave',  mouseuphandler);
					 
					 that.runcallbacks('mousedown');	

					 ev.stopPropagation();
					 ev.preventDefault();
					 return false; 
				 }
			}// mousedown handler	

			$a.find('.markerpoint_props').css('visibility', 'visible');
			
			if(that.type == '3druler')
				var $target = $a.$rulertextInner;
			else
				var $target = $a;

			$target.off('mouseenter mousedown mouseup mouseleave mousewheel DOMMouseScroll');
			$target.css('pointer-events', 'all');
			$target.on('mouseenter',  that.onHoverEnter );
			$target.on('mouseleave',  that.onHoverLeave);
			$target.on('mousedown',   mousedown);
			$target.on('dblclick',   function(ev2) {
				if (that.parentmarkerset.state.showThroughSlice)
				{
						var p = $a.medViewer.getRealWorldCoordinatesFromMouseEvent(ev2.clientX, ev2.clientY);
						that.movepoint( p._data, $a.medViewer );
				}			
			});
			
			$a.on('mousewheel DOMMouseScroll',  MouseWheelHandler);

			// attach the resizer handlers
			if( $a.$resizerA != undefined )
				attachResizeHandlers(that, $a, $a.$resizerA, 1);
			if( $a.$resizerB != undefined )
				attachResizeHandlers(that, $a, $a.$resizerB, 0);

		} // end state.locked == false

		if(state.locked == true)
		{
			$a.css('pointer-events', 'none');
			$a.find('.markerpoint_props').css('visibility', 'hidden');
			$a.off('mouseenter');
			$a.off('mousedown' );
		}
		
		if(state.hoverdetails == true)
		{
			$a.find('.markerpoint_props').css('visibility', 'visible');
		}
		
		if(state.hoverdetails == false)
		{
			$a.find('.markerpoint_props').css('visibility', 'hidden');
		}

	}


    that.onHoverEnter = function()
    {
        for(var mid in $markers)
        {
			// version with recreating the objects on each hover --> some strange synchro behaviour
			if(recreateInfoBoxOnHover)
			{
				 var $props = $("<div class = 'markerpoint_props'></div>");
				 var thingstoshow = {colorsel:1, id:1, name:1, toggle:0, search:0, delete:1,  coords:1,comment:1};
				 $props.append( that.createMarkerRepresentation('self' + mid, thingstoshow ) ).hide().fadeIn(100);

				 $markers[mid].append($props)
				 that.runcallbacks('createinfobox', $props);
			}

           	// glow effect
           	$markers[mid].addClass('annotation_point_hovered');

        }
    }

    that.onHoverLeave = function(e)
    {
        for(var mid in $markers)
        {
           if( recreateInfoBoxOnHover )
            	$markers[mid].find('.markerpoint_props').fadeOut(100, function(){$markers[mid].find('.markerpoint_props').remove()});

           	// remove glow effect
            	$markers[mid].removeClass('annotation_point_hovered');
        }
    }                    


	function attachResizeHandlers(point, $a, $resizer, edgeindex)
	{
		// first remove all handlers, otherwise they will pile up!!!
		$resizer.off("mousedown mousemove mouseup mouseleave");
		
		$resizer.on("mousedown", function(ev)
		{
			if(ev.originalEvent.which != 1)
				return;

			var startMouse = [ev.clientX, ev.clientY];
			markerProxy.setDraggedPoint(  point, 1 );
			function mousemove(ev2)
			{
		 		point.setsizeFromMouseEvent(edgeindex,startMouse, [ev2.clientX,ev2.clientY], $a.medViewer, 'donotrecalc');
				//console.log(edgeindex)
				ev2.preventDefault(); ev2.stopPropagation(); return false;
			}

			function mouseup(ev2)
			{
		 		point.setsizeFromMouseEvent(edgeindex,startMouse, [ev2.clientX,ev2.clientY], $a.medViewer, 'recalc' );
				markerProxy.setDraggedPoint();
				$a.medViewer.$container.off("mousemove", mousemove)
				$a.medViewer.$container.off("mouseup mouseleave",mouseup);
			}

			$a.medViewer.$container.on("mousemove",mousemove);
			$a.medViewer.$container.on("mouseup mouseleave",mouseup);
			
			ev.preventDefault(); 			ev.stopPropagation(); 			return false;
			

		});
	}


	function attachRulerHandlers($a)
	{



		$a.on("mousedown",mousedownbody);
		
		if($a.$text)
			$a.$text.on("mousedown",mousedownbody);

		function mousedownbody(e){
			var medViewer = $a.medViewer;
			//var startdiff = [e.clientX - $a.offset().left - $a.width()/2 - 4, e.clientY - $a.offset().top - $a.height()/2 -4 ];
			var startMouse = [e.clientX, e.clientY];
			var startOffs = medViewer.getCanvasCoordinates(that.p.coords );
			var cpos  = getPixelPosition( medViewer.$canvascontainer );
			var abspos = [startOffs.x_pix + cpos[0],  startOffs.y_pix + cpos[1] ]

			$(document.body).on("mousemove",mousemove);
			function mousemove(e2)
			{
// 				that.movepoint(medViewer.getRealWorldCoordinatesFromMouseEvent(
// 					e2.clientX - startdiff[0],e2.clientY - startdiff[1]));
				that.movepoint(medViewer.getRealWorldCoordinatesFromMouseEvent(
					(e2.clientX - startMouse[0]) + abspos[0],    (e2.clientY - startMouse[1]) + abspos[1]) );

			}
			$(document.body).on("mouseup mouseleave",mouseup);
			function mouseup(e2)
			{
				$(document.body).off("mousemove",mousemove)
				$(document.body).off("mouseup mouseleave",mouseup);
			}

		}

		$a.$term_a.on('mousedown', mousedown(-1));
		$a.$term_b.on('mousedown', mousedown(1));
		function mousedown(sg) { return function(e)
		{
			var medViewer = $a.medViewer;
			var canvascoords = medViewer.getCanvasCoordinates(that.p.coords);
			var dir = that.dir;
			var tmp = medViewer.getCanvasCoordinates(that.p.coords);
			var fac = canvascoords.x_pixPerMM; 

			var c = [(e.clientX - fac*sg*dir[0]),(e.clientY - fac*sg*dir[1])];


			$(document.body).on("mousemove",mousemove);
			function mousemove(e2)
			{
				that.dir = [-sg*(c[0]-e2.clientX)/fac , -sg*(c[1]-e2.clientY)/fac];

				that.movepoint(medViewer.getRealWorldCoordinatesFromMouseEvent(
					0.5*(c[0]+e2.clientX),0.5*(c[1]+e2.clientY))._data);

			}
			$(document.body).on("mouseup mouseleave",mouseup);
			function mouseup(e2)
			{
				$(document.body).off("mousemove",mousemove)
				$(document.body).off("mouseup mouseleave",mouseup);
			}

			return false;

		} };
	}




    // visual removement
    that.clearpoint = function()
    {
        for(var mid in $markers)
        {
            $markers[mid].remove();
            delete $markers[mid];
        }

        for(var mid in glmesh)
        {
       		glmesh[mid].dispose()
       		if (glmesh[mid].viewer.gl)
       			glmesh[mid].viewer.gl.activateRenderLoop();
            delete glmesh[mid];
        }

        if(that.type =='pointROI' && that.roinii && that.roinii.fileObject)
        {
			// simply remove the representation on clearpoint
			KViewer.iterateMedViewers( function(medViewer) 
			{
				for(var k=0; k< medViewer.ROIs.length;  k++)
				{
					if(medViewer.viewport.pointROIviewer ==undefined &&  medViewer.ROIs[k].roi.fileID == that.roinii.fileObject.fileID )
					{
						medViewer.ROIs.splice(k,1);
						medViewer.drawSlice();
						break;	
					}
				} 
			});
			// could also redraw this way
			//signalhandler.send("updateImage", {id: that.roinii.fileObject.fileID});
        }

	    

    }



	// true deletion of this point
	that.deletepoint = function()
    {
        signalhandler.detachByIdList(sigIdList);
        delete parentmarkerset.markerpoints[id];

		that.clearpoint();
        //that.callbacks.delete.forEach( function(callback) {callback();} );
        that.runcallbacks('delete');

        

		that.visible = false;
		for (var x in that.onupdate)
			that.onupdate[x]();

        for (var x in that.removeupdater)
            that.removeupdater[x]();

        for (var x in parentmarkerset.onupdate)
            parentmarkerset.onupdate[x]();


		parentmarkerset.pointChanged();
        that.parentmarkerset.drawLine();

        
    }


	that.closescribble = function()
    {
    	that.isclosed = 1;
    	that.drawpoint();
    }



    /***************************************************************************************
    * signal handlers
    ****************************************************************************************/
	var sigIdList = [];
	sigIdList.push( signalhandler.attach("positionChange",that.drawpoint) );
    sigIdList.push( signalhandler.attach("setZoom", that.drawpoint) );
//    sigIdList.push( signalhandler.attach("canvasLayoutChanged", that.drawpoint) );

    //sigIdList.push( signalhandler.attach("close", that.removepoint) );


    return that;
}













function earcut(data, holeIndices, dim) {

    dim = dim || 2;

    var hasHoles = holeIndices && holeIndices.length,
        outerLen = hasHoles ? holeIndices[0] * dim : data.length,
        outerNode = linkedList(data, 0, outerLen, dim, true),
        triangles = [];

    if (!outerNode) return triangles;

    var minX, minY, maxX, maxY, x, y, size;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length > 80 * dim) {
        minX = maxX = data[0];
        minY = maxY = data[1];

        for (var i = dim; i < outerLen; i += dim) {
            x = data[i];
            y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // minX, minY and size are later used to transform coords into integers for z-order calculation
        size = Math.max(maxX - minX, maxY - minY);
    }

    earcutLinked(outerNode, triangles, dim, minX, minY, size);

    return triangles;


// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(data, start, end, dim, clockwise) {
    var i, last;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
        for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    return last;
}

// eliminate colinear or duplicate points
function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;

    var p = start,
        again;
    do {
        again = false;

        if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            removeNode(p);
            p = end = p.prev;
            if (p === p.next) return null;
            again = true;

        } else {
            p = p.next;
        }
    } while (again || p !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, dim, minX, minY, size, pass) {
    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && size) indexCurve(ear, minX, minY, size);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (size ? isEarHashed(ear, minX, minY, size) : isEar(ear)) {
            // cut off the triangle
            triangles.push(prev.i / dim);
            triangles.push(ear.i / dim);
            triangles.push(next.i / dim);

            removeNode(ear);

            // skipping the next vertice leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering points and slicing again
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, dim, minX, minY, size, 1);

            // if this didn't work, try curing all small self-intersections locally
            } else if (pass === 1) {
                ear = cureLocalIntersections(ear, triangles, dim);
                earcutLinked(ear, triangles, dim, minX, minY, size, 2);

            // as a last resort, try splitting the remaining polygon into two
            } else if (pass === 2) {
                splitEarcut(ear, triangles, dim, minX, minY, size);
            }

            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear
    var p = ear.next.next;

    while (p !== ear.prev) {
        if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }

    return true;
}

function isEarHashed(ear, minX, minY, size) {
    var a = ear.prev,
        b = ear,
        c = ear.next;

    if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

    // triangle bbox; min & max are calculated like this for speed
    var minTX = a.x < b.x ? (a.x < c.x ? a.x : c.x) : (b.x < c.x ? b.x : c.x),
        minTY = a.y < b.y ? (a.y < c.y ? a.y : c.y) : (b.y < c.y ? b.y : c.y),
        maxTX = a.x > b.x ? (a.x > c.x ? a.x : c.x) : (b.x > c.x ? b.x : c.x),
        maxTY = a.y > b.y ? (a.y > c.y ? a.y : c.y) : (b.y > c.y ? b.y : c.y);

    // z-order range for the current triangle bbox;
    var minZ = zOrder(minTX, minTY, minX, minY, size),
        maxZ = zOrder(maxTX, maxTY, minX, minY, size);

    // first look for points inside the triangle in increasing z-order
    var p = ear.nextZ;

    while (p && p.z <= maxZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.nextZ;
    }

    // then look for points in decreasing z-order
    p = ear.prevZ;

    while (p && p.z >= minZ) {
        if (p !== ear.prev && p !== ear.next &&
            pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
            area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;
    }

    return true;
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start, triangles, dim) {
    var p = start;
    do {
        var a = p.prev,
            b = p.next.next;

        if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

            triangles.push(a.i / dim);
            triangles.push(p.i / dim);
            triangles.push(b.i / dim);

            // remove two nodes involved
            removeNode(p);
            removeNode(p.next);

            p = start = b;
        }
        p = p.next;
    } while (p !== start);

    return p;
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start, triangles, dim, minX, minY, size) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (a.i !== b.i && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, dim, minX, minY, size);
                earcutLinked(c, triangles, dim, minX, minY, size);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(data, holeIndices, outerNode, dim) {
    var queue = [],
        i, len, start, end, list;

    for (i = 0, len = holeIndices.length; i < len; i++) {
        start = holeIndices[i] * dim;
        end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        list = linkedList(data, start, end, dim, false);
        if (list === list.next) list.steiner = true;
        queue.push(getLeftmost(list));
    }

    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode, outerNode.next);
    }

    return outerNode;
}

function compareX(a, b) {
    return a.x - b.x;
}

// find a bridge between vertices that connects hole with an outer ring and and link it
function eliminateHole(hole, outerNode) {
    outerNode = findHoleBridge(hole, outerNode);
    if (outerNode) {
        var b = splitPolygon(outerNode, hole);
        filterPoints(b, b.next);
    }
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(hole, outerNode) {
    var p = outerNode,
        hx = hole.x,
        hy = hole.y,
        qx = -Infinity,
        m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
        if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
            var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
            if (x <= hx && x > qx) {
                qx = x;
                if (x === hx) {
                    if (hy === p.y) return p;
                    if (hy === p.next.y) return p.next;
                }
                m = p.x < p.next.x ? p : p.next;
            }
        }
        p = p.next;
    } while (p !== outerNode);

    if (!m) return null;

    if (hx === qx) return m.prev; // hole touches outer segment; pick lower endpoint

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var stop = m,
        mx = m.x,
        my = m.y,
        tanMin = Infinity,
        tan;

    p = m.next;

    while (p !== stop) {
        if (hx >= p.x && p.x >= mx && hx !== p.x &&
                pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

            tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

            if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && locallyInside(p, hole)) {
                m = p;
                tanMin = tan;
            }
        }

        p = p.next;
    }

    return m;
}

// interlink polygon nodes in z-order
function indexCurve(start, minX, minY, size) {
    var p = start;
    do {
        if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY, size);
        p.prevZ = p.prev;
        p.nextZ = p.next;
        p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    sortLinked(p);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
        inSize = 1;

    do {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }
            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }

                if (tail) tail.nextZ = e;
                else list = e;

                e.prevZ = tail;
                tail = e;
            }

            p = q;
        }

        tail.nextZ = null;
        inSize *= 2;

    } while (numMerges > 1);

    return list;
}

// z-order of a point given coords and size of the data bounding box
function zOrder(x, y, minX, minY, size) {
    // coords are transformed into non-negative 15-bit integer range
    x = 32767 * (x - minX) / size;
    y = 32767 * (y - minY) / size;

    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// find the leftmost node of a polygon ring
function getLeftmost(start) {
    var p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x) leftmost = p;
        p = p.next;
    } while (p !== start);

    return leftmost;
}

// check if a point lies within a convex triangle
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
           (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
           (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
           locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b);
}

// signed area of a triangle
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two points are equal
function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    if ((equals(p1, q1) && equals(p2, q2)) ||
        (equals(p1, q2) && equals(p2, q1))) return true;
    return area(p1, q1, p2) > 0 !== area(p1, q1, q2) > 0 &&
           area(p2, q2, p1) > 0 !== area(p2, q2, q1) > 0;
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(a, b) {
    var p = a;
    do {
        if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                intersects(p, p.next, a, b)) return true;
        p = p.next;
    } while (p !== a);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
        area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
        area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(a, b) {
    var p = a,
        inside = false,
        px = (a.x + b.x) / 2,
        py = (a.y + b.y) / 2;
    do {
        if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
            inside = !inside;
        p = p.next;
    } while (p !== a);

    return inside;
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a, b) {
    var a2 = new Node(a.i, a.x, a.y),
        b2 = new Node(b.i, b.x, b.y),
        an = a.next,
        bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i, x, y, last) {
    var p = new Node(i, x, y);

    if (!last) {
        p.prev = p;
        p.next = p;

    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}

function Node(i, x, y) {
    // vertice index in coordinates array
    this.i = i;

    // vertex coordinates
    this.x = x;
    this.y = y;

    // previous and next vertice nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = null;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // indicates whether this is a steiner point
    this.steiner = false;
}

// return a percentage difference between the polygon area and its triangulation area;
// used to verify correctness of triangulation
earcut.deviation = function (data, holeIndices, dim, triangles) {
    var hasHoles = holeIndices && holeIndices.length;
    var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
    if (hasHoles) {
        for (var i = 0, len = holeIndices.length; i < len; i++) {
            var start = holeIndices[i] * dim;
            var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            polygonArea -= Math.abs(signedArea(data, start, end, dim));
        }
    }

    var trianglesArea = 0;
    for (i = 0; i < triangles.length; i += 3) {
        var a = triangles[i] * dim;
        var b = triangles[i + 1] * dim;
        var c = triangles[i + 2] * dim;
        trianglesArea += Math.abs(
            (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
            (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
    }

    return polygonArea === 0 && trianglesArea === 0 ? 0 :
        Math.abs((trianglesArea - polygonArea) / polygonArea);
};

function signedArea(data, start, end, dim) {
    var sum = 0;
    for (var i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}


}


// turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
earcut.flatten = function (data) {
    var dim = data[0][0].length,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
        }
        if (i > 0) {
            holeIndex += data[i - 1].length;
            result.holes.push(holeIndex);
        }
    }
    return result;
};









// ======================================================================================
// ============= create a roi around a centerpoint bounded to a radius
// ======================================================================================
function createPointROI(p)
{

	// test setting
// 	if(p == undefined)
// 		var p = markerProxy.markersets[0].getPoints()[0];
	
	var markerPanel = p.parentmarkerset.markerPanel ||  p.parentmarkerset.showPanel() ;

	var medViewer ;// =  KViewer.viewports[0].medViewer;
	var niitemplate;

	var that = new Object();
	
	// number of edge pixels in bounding box
	var nr = 1;

	
	var center = p.coords;
	var radius = p.size;
	
	
	var roi  = undefined;
	that.fileObject = undefined;
	that.refimagefileID = undefined;

	var viewObject = that.viewObject = 
	{
            type: "roi",
            roi: that.fileObject,
            isCurrent: false,
            color: 2,
            visible: true,
            close: function(){ 
            console.log('closing view')}
    };

	var roiname = "pointROI" + p.uuid ;



	//******************************************************
	// Create and customize a Free Viewer
	//******************************************************
	if(markerPanel.freeView == undefined)
	{

		var fvpanel = KPanel($(document.body),'viewportpanel'+(KPanelView.runningID++), "<b>" + p.parentmarkerset.name + "</b>   3D view");
		
		var pp = getPixelPosition( markerPanel.$container );
		var w = 300;

		
		setPixelPosition(fvpanel.$container, [pp[0]+pp[2] - w, pp[1]+pp[3] + 50 , 300, 300]);	
		var freeView =  new KFreeView(KViewer, fvpanel.$container);
		freeView.panel = fvpanel;
		resizeTriangle(function() {},freeView.resize, fvpanel.$container ).appendTo(freeView.$container);
	 	freeView.onsetContent = function()
		{
			if (freeView.medViewer )
			{
				freeView.medViewer.hideControls( {toolbar: 1, timediv:1});
				freeView.medViewer.histoManager.hide()
				freeView.medViewer.histoManager.hidden = true;
				freeView.medViewer.$infobar.hide();
				freeView.medViewer.$infobar.hidden = true;
// 				if(freeView.medViewer.gl)
// 					freeView.medViewer.gl.camera.getScene().clearColor = new BABYLON.Color3(0.02, 0.02, 0.02);

				//signalhandler.send("updateImage",{id:that.fileObject.fileID});	
					
// 	  		 	function loadSurfIntoViewport(fobj){
// 	  		 	var surfView = medViewer.appendObject3D(fobj, {
//                                 color: 2
//                             });
// 	  		 	}
// 	  		 	if (fileObject.fileinfo.surfreference == undefined)
// 			 		KViewer.obj3dTool.createSurfaceFromROI(fileObject, loadSurfIntoViewport);
				 	
			}
		}
		var temp = $("<div class='markerROIStats'></div>");
		freeView.$container.append(temp)
		freeView.$infobar = temp;
    	freeView.pointROIviewer = true;
		freeView.clearColors = [[0,0,0], [1,1,1]];
		freeView.currentClearColor = 0;

		var $colsel = $("<span style='width:20px;background:white;'>&nbsp;</span>").prependTo(fvpanel.$topRow);
		$colsel.click(function()
		{
			freeView.currentClearColor = (freeView.currentClearColor+1)%(freeView.clearColors.length);
			var clearColor = freeView.clearColors[freeView.currentClearColor];
			$colsel.css('background', "rgb("+clearColor[0]*255+","+clearColor[1]*255+","+clearColor[2]*255+")");
			freeView.medViewer.gl.engine.scenes[0].clearColor =  new BABYLON.Color3(clearColor[0], clearColor[1], clearColor[2]);
			freeView.medViewer.gl.engine.scenes[0].render();
			if(clearColor[0]==0)
				freeView.$infobar.css('color', '', 'background', '');
			else
				freeView.$infobar.css('color', 'black', 'background', 'red');


// 			var camera = freeView.medViewer.gl.engine.scenes[0].activeCamera
// 	        camera.upVector = new BABYLON.Vector3(0, 1, 0);
// 			freeView.medViewer.gl.engine.scenes[0].activeCamera.setPosition( new BABYLON.Vector3(0, 0, 20));
// 			freeView.medViewer.gl.engine.scenes[0].render();


		});


		markerPanel.freeView = freeView;

	}
	else
	{
		markerPanel.freeView.panel.$container.show();
	}




		//var fv = KViewer.roiTool.createView(fileObject, KViewer.viewports[0].medViewer, {color:2, hideview:0 });
		// medViewer.ROIs.push(viewObject);

		// does not work, to be implemented
		//KViewer.obj3dTool.createSurfaceFromROI(fileObject, function(){});

	

	p.onupdate.pointROI = updateROI;
	//p.callbacks.move.pointROI = updateROI;
	
	//p.callbacks.delete.pointROI = function() {KViewer.roiTool.deleteROI(that.fileObject.fileID)};
	p.callbacks.delete.pointROI = function(){ KViewer.iterateMedViewers( function(medViewer) 
	{
		for(var k=0; k< medViewer.ROIs.length;  k++)
		{
			if(medViewer.viewport.pointROIviewer ==undefined &&  medViewer.ROIs[k].roi.fileID == that.fileObject.fileID )
			{
				medViewer.ROIs.splice(k,1);
				signalhandler.send('positionChange');	
				break;	
			}
		} 
		if( markerPanel.freeView.medViewer)
		{
			if( markerPanel.freeView.medViewer.ROIs.length > 0 &&  markerPanel.freeView.medViewer.ROIs[0].roi.fileID == that.fileObject.fileID )
			{
				//markerPanel.freeView.medViewer.close();
				var troi = markerPanel.freeView.medViewer.ROIs[0];
				
				if(troi.refSurfView && troi.refSurfView.surf)
				{
	 					KViewer.dataManager.delFile( troi.refSurfView.surf.fileID );
				}
				troi.close();
				markerPanel.freeView.medViewer.currentFileID = undefined;

 				if( markerPanel.freeView.medViewer.objects3D.length > 0 )
 				{
 					 var fid = markerPanel.freeView.medViewer.objects3D[0].refRoiView.content.fileID;
 					 if(fid == that.fileObject.fileID)
 					 {
//	 					markerPanel.freeView.medViewer.objects3D[0].refRoiView.close();
	 					markerPanel.freeView.medViewer.objects3D[0].close();
 					 }
 				}
 	
				markerPanel.freeView.$infobar.html("no point selected");
			} 
		}
		if(that.fileObject)
		{
			KViewer.dataManager.delFile(that.fileObject.fileID);
			KViewer.cacheManager.update();
		}


	}) }

	

	//******************************************************
	// resize or move the roi
	//******************************************************
	function createROINii( )
	{
		// a valid pbject is already here, only update
		if(that.fileObject != undefined)
		{
			resizeROI( true );
			return;
		}

		var center = p.coords;


		var voxSize = niitemplate.voxSize;
		var edges = math.multiply(niitemplate.edges,1);

		var cvox = math.round( math.multiply(math.inv(niitemplate.edges), center)._data );
		var vv = [math.ceil(radius  / voxSize[0]) +nr, math.ceil(radius  / voxSize[1])+nr, math.ceil(radius  / voxSize[2])+nr, 0];
		var sizes = [vv[0]*2,vv[1]*2,vv[2]*2, 1];
		var spaceorigin = math.multiply(niitemplate.edges,  math.add(cvox, math.multiply(vv,-1) )  );


		edges._data[0][3] = spaceorigin._data[0];
		edges._data[1][3] = spaceorigin._data[1];
		edges._data[2][3] = spaceorigin._data[2];


		var fobj = { content : { edges: edges,  bbox: undefined, voxSize: voxSize, sizes: sizes, pixdim: [3,voxSize[0],voxSize[1],voxSize[2]] } };

		that.fileObject =  cloneNifti(fobj,roiname,"uint8",1);
		that.fileObject.fileID = roiname;
		that.fileObject.filename = roiname + ".nii";
		roi = that.fileObject.content;
		viewObject.roi = that.fileObject;
		
		// for some reason that should also be here
		viewObject.nii =  that.fileObject.content
		
		that.fileObject.fileinfo = {Tag:'/mask/'};

		//attach the updater for 3D computeIsoDurface worker
		//this will then be forwarded to the surfreference and finally to its updater
		that.fileObject.update = calcAndSetStatistics;

		// add to data manager --> necessary beacuse of 3D view
		KViewer.dataManager.setFile(that.fileObject.fileID, that.fileObject);
		KViewer.cacheManager.update();


	}


	//******************************************************
	// resize or move the roi
	//******************************************************
	function resizeROI( force_resize )
	{
		
	// what can be changed:
		// shift -> edges only 
		// radius -> sizes -> must recreate the buffer

		var center = p.coords;

		// size has changed
		var sizechanged = false;

		if( force_resize | radius != p.size)
		{
			radius = p.size;
			sizechanged = true;
		}

		var voxSize = niitemplate.voxSize;
		var edges = math.multiply(niitemplate.edges,1);


		var cvox = math.round( math.multiply(math.inv(niitemplate.edges), center)._data );
		var vv = [math.ceil(radius  / voxSize[0]) +nr, math.ceil(radius  / voxSize[1])+nr, math.ceil(radius  / voxSize[2])+nr, 0];
		var sizes = [vv[0]*2,vv[1]*2,vv[2]*2, 1];
		var spaceorigin = math.multiply(niitemplate.edges,  math.add(cvox, math.multiply(vv,-1) )  );

		edges._data[0][3] = spaceorigin._data[0];
		edges._data[1][3] = spaceorigin._data[1];
		edges._data[2][3] = spaceorigin._data[2];

		sizes = sizechanged?sizes:undefined
		resizeNifti(that.fileObject, edges,  sizes )

		
		/*
			var center = p.coords;

			if( radius != p.size)
			{
				radius = p.size;
				var voxSize = niitemplate.voxSize;
				var cvox = math.round( math.multiply(math.inv(niitemplate.edges), center)._data );
				var vv = [math.ceil(radius  / voxSize[0]) +nr, math.ceil(radius  / voxSize[1])+nr, math.ceil(radius  / voxSize[2])+nr, 0];
				var sizes = [vv[0]*2,vv[1]*2,vv[2]*2, 1];
			}
			else
			{
				var voxSize = roi.voxSize;
				var cvox = math.round( math.multiply(math.inv(niitemplate.edges), center)._data );
				var vv = [math.ceil(radius  / voxSize[0]) +nr, math.ceil(radius  / voxSize[1])+nr, math.ceil(radius  / voxSize[2])+nr, 0];
				var sizes = undefined;
			}
			var spaceorigin = math.multiply(niitemplate.edges,  math.add(cvox, math.multiply(vv,-1) )  );

			resizeNifti(that.fileObject, spaceorigin,  sizes )
		*/
	}



	//******************************************************
	// calc content
	//******************************************************
	function updateROI(medViewer_clicked, ev, thresh)
	{

		if(thresh != undefined)
			p.thresh = thresh;
		if(thresh == undefined && p.thresh == undefined)
			p.thresh = parseFloat( markerPanel.pointROITool.$thresh.val() );
			
		if( !p.visible )
			return
		
		// do NOT update on mousemoves, too expensive. Instead, print something else as info.
		if( ev != undefined && (ev == 'donotrecalc' || ev.type == 'mousemove') )
		{
			markerPanel.freeView.$infobar.html('waiting for mouse release ...')
			return
		}

		// no specific medViewer clicked ... try to find an image
		if(niitemplate==undefined && medViewer_clicked == undefined )
		{

			KViewer.iterateMedViewers( function(medViewer) 
			{
				if(medViewer.viewport.pointROIviewer ==undefined && medViewer.nii){
					medViewer_clicked = medViewer; 
					 }
			});
		}
		
		// nothing to to do ...
		if( medViewer_clicked == undefined && niitemplate==undefined)
		{
			that.fileObject = undefined;
			return false
		}


		markerPanel.freeView.$infobar.html('modifying roi ...');
		
		// did the template nifti change? if yes, recreate the roi, otherwise just resize
		var template_changed = false;
		if(medViewer_clicked != undefined && medViewer_clicked.nii !=undefined && niitemplate != medViewer_clicked.nii)
		{
			medViewer = medViewer_clicked;
			niitemplate = medViewer_clicked.niiOriginal;
			that.niitemplate = niitemplate;
			that.refimagefileID = medViewer_clicked.currentFileID;
			createROINii();
			template_changed = true;
		}
		else
		{
			resizeROI();
		}


		var roiPanel = KViewer.roiTool.roiPanel;
		var roiTool = KViewer.roiTool;

		var center = p.coords;
		var radius = p.size;

		// prepare all necessary variables to use the "modifyRoiInternal" function from the roi tool from here
		var state = $.extend(true, {}, roiPanel.getState());


		//state.threspen = 1;

		if( p.parentmarkerset.markerPanel.pointROITool.pen == 'regionGrowRestrict' )
			state.regionGrowRestric = true;


		// for some reason, ther must be sqrt2 here ....!
		state.pencil.radius   = radius ;
		state.pencil.radius_z = radius ;
		state.threspen = markerPanel.pointROITool.threspen;

		//state.pencil.thres = p.thresh;
		// we change thresh to low/high, could also implement this here, for now take only lower / higher
		if(state.threspen == 1)
		{
			state.pencil.thres_high = 'off';
			state.pencil.thres_low = p.thresh;
		}
		else if(state.threspen == 2)
		{
			state.pencil.thres_high = p.thresh;
			state.pencil.thres_low = 'off';
		}



		state.nii = roi;

		var points_wc = center;
		var valtoset = 1;
		
		// empty the roi first
		roi.data.fill(0)

//////////////////////////////////////////
		function updateDistanceLine()
		{
			if( markerPanel.freeView.medViewer &&  markerPanel.freeView.medViewer.gl )
			{
				var scene = markerPanel.freeView.medViewer.gl.scene;

				if(markerPanel.freeView.medViewer.distanceLine == undefined )
				{
					 //[(new BABYLON.Vector3(
					 var myPoints =[new BABYLON.Vector3(0, 0, 0),new BABYLON.Vector3(0, 0, 1)];
	 				 var tube = BABYLON.MeshBuilder.CreateTube("tube", {path: myPoints,radius:.3, sideOrientation: BABYLON.Mesh.DOUBLESIDE, updatable: true, tesselation:3}, scene); 
						tube.material = new BABYLON.StandardMaterial("texture1", scene);
						tube.material.diffuseColor  = new BABYLON.Color3(0.6, 0.6, 0.6);
						tube.material.backFaceCulling = false;
					 markerPanel.freeView.medViewer.distanceLine = tube;

//					 markerPanel.freeView.medViewer.distanceLine = BABYLON.MeshBuilder.CreateLines("lines", {points: myPoints, updatable:true}, scene);		
				}
				
				if(that.stats.firstPoint ==undefined || that.stats.secondPointPoint ==undefined)
					return;

				var p1 = that.stats.firstPoint;			
				p1 = math.multiply(roi.edges,[p1[0],p1[1],p1[2],1]);
				p1 = markerPanel.freeView.medViewer.gl.world2GL(p1._data); 	
				
				var p2 = that.stats.secondPoint;
				p2 = math.multiply(roi.edges, [p2[0],p2[1],p2[2],1]); 
				p2 = markerPanel.freeView.medViewer.gl.world2GL(p2._data); 

				var ssa = .2;
				var ssb = 1+ssa;
				var p2_2 = [0,0,0]; var vec1 = [p2[0]-p1[0], p2[1]-p1[1], p2[2]-p1[2],0]; 
				p2_2[0] = p1[0]+ssb*vec1[0];  p2_2[1] = p1[1]+ssb*vec1[1]; p2_2[2] = p1[2]+ssb*vec1[2];

				var p1_1 = [0,0,0]; p1_1[0] = p1[0]-ssa*vec1[0]; p1_1[1] = p1[1]-ssa*vec1[1]; p1_1[2] = p1[2]-ssa*vec1[2];
				var myPath = [(new BABYLON.Vector3(p1_1[0],p1_1[1],-p1_1[2])),(new BABYLON.Vector3(p2_2[0],p2_2[1],-p2_2[2]))];

//				markerPanel.freeView.medViewer.distanceLine =  BABYLON.MeshBuilder.CreateLines(null, {points: myPath, instance: markerPanel.freeView.medViewer.distanceLine});
				markerPanel.freeView.medViewer.distanceLine =  BABYLON.MeshBuilder.CreateTube(null, {path: myPath, radius:.01*that.stats.diameter, instance: markerPanel.freeView.medViewer.distanceLine});
			
			}
		}
		//////////////////////////////////////////
		

		regionGrow.changedPoints = [];
	    roiTool.modifyRoiInternal(points_wc, valtoset, undefined, medViewer, state,function(changedPoints)
	    {
			//that.fileObject.modified = true;

			// create view in all viewports if necessary
			KViewer.iterateMedViewers( function(medViewer) 
				{
					if( medViewer.viewport.pointROIviewer !=undefined )
						return

					var found = false;

					for(var k=0; k< medViewer.ROIs.length;  k++)
						if( medViewer.ROIs[k].roi.fileID == that.fileObject.fileID )
							found = true;
					if(!found)
					{
						viewObject.color  = KColor.findColorIndex(p.p.color.color) ;    
						medViewer.ROIs.push(viewObject);		
						signalhandler.send('positionChange');		
					}
				});

			signalhandler.send("updateImage",{id:that.fileObject.fileID});
			markerPanel.freeView.$infobar.html('calculating statistics ...');
			//window.setTimeout( calcAndSetStatistics,0 );
			updateDistanceLine();
	    });
	}
	that.updateROI = updateROI;




	that.stats = {};
	function calcAndSetStatistics()
	{
		//return;
		var stats = calcInertiaTensor( roi, that.niitemplate ) ;

		that.stats = stats;
		//************** report  *********************
		// mL or microliters ??
		if( stats.volume < 1)
			var volumestr = (stats.volume *1000).toFixed(1) + " microL";
		else
			var volumestr = stats.volume.toFixed(1) + " mL";


		var str = "";
		str += "<div class='markerROIStats_' ><div style='color:orange'>" + p.p.name+ " statistics</div><table >";
		
		str += "<tr><td>volume:</td><td>" + volumestr + " </td></tr>";

		if(stats.diameter !== false)
			str += "<tr><td>maxdiameter:</td><td> " + stats.diameter.toFixed(1) + " mm </td></tr>"; 
			
		str += "<tr><td>L1:</td><td> " + stats.mainAx2.toFixed(1)  + " mm </td></tr>";
		str += "<tr><td>L2:</td><td> " + stats.mainAx1.toFixed(1)  + " mm </td></tr>";
		str += "<tr><td>L3:</td><td> " + stats.mainAx0.toFixed(1)  + " mm </td></tr>";

		if(that.fileObject.fileinfo.surfreference!=undefined)
		{
			var surf = that.fileObject.fileinfo.surfreference.content.area || NaN;

			str += "<tr><td>surface:</td><td> " + surf.toFixed(1)  + " mm2 </td></tr>";
			str += "<tr><td>vol/surf:</td><td> " + (stats.volume*1000 / surf).toFixed(1)  + " mm </td></tr>";

			// compare surf/ vol with a sphere 
			//     volume: 4/3*pi*r^3
			//     surf  :  4*pi*r^2
			// 	   vol / surf = 1/3 * r --> scales with r, so not very descriptive
			// alternative: "Sphericity (eg wikipedia"):  surf of corresponding sphere divided by actual surf.
			// however, not very precise for few voxels
			var radius_of_sphere__with_same_vol   = Math.pow( stats.volume*1000/ Math.PI / 4 * 3, 1/3);
			var surf_of_sphere_with_same_vol = 4*Math.PI*radius_of_sphere__with_same_vol*radius_of_sphere__with_same_vol;
			var ratio = surf_of_sphere_with_same_vol / surf;
			str += "<tr><td>sphericity:</td><td> " + ratio.toFixed(2) + " </td></tr>";

		}
		str += "<tr><td>median</td><td> " + stats.median.toFixed(0)  + " HU  </td></tr>";
		//str += "<tr><td>mean</td><td> " + stats.mean.toFixed(0)  + "HU  </td></tr>";
		str += "<tr><td>std</td><td> " + stats.std.toFixed(0)  + " HU  </td></tr>";


		str += "</table></div>";
		//************** report  *********************


		// append the info to all marker
		for(var m in p.$markers)
		{
			if(p.$markers[m].$roiinfo == undefined)
			{
				var $roiinfo = p.$markers[m].$roiinfo = $("<div style='__background:white'></div>");
				p.$markers[m].find('.markerpoint_props').append($roiinfo);
			}
			else
			{
				$roiinfo = p.$markers[m].$roiinfo; 
			}
			$roiinfo.html(str);
		}

		// set the info in the 3D free View
		if(markerPanel.freeView.medViewer)
			markerPanel.freeView.$infobar.html(str);
	}
	
	that.setThisPointInto3DView = function(forceshow)
	{
		if( !that.fileObject )
			return false

			
		if( !markerPanel.freeView.medViewer || that.fileObject.fileID  !== markerPanel.freeView.medViewer.currentFileID )
		{
			
 			if (markerPanel.freeView.medViewer)
 			{
				// return if already in view
				if(markerPanel.freeView.medViewer.nii == that.fileObject.content)	
					return false

 				markerPanel.freeView.medViewer.currentFileID = undefined;
 				if (markerPanel.freeView.medViewer.ROIs && markerPanel.freeView.medViewer.ROIs.length>0)
 					markerPanel.freeView.medViewer.ROIs[0].close();
 				
 				if (markerPanel.freeView.medViewer.objects3D && markerPanel.freeView.medViewer.objects3D.length>0)
 					markerPanel.freeView.medViewer.objects3D[0].close();
 			}
			p;
			var intent = 
			{	
				hideControls: {toolbar: 1, timediv:1},
				color:KColor.findColorIndex(p.p.color.color),
				gl: 1, 
				gl_props:
				{
					radius: math.max(that.fileObject.content.sizes)*6,
					planesVisibility: [0,0,0]
				},
				isosurf: (that.fileObject.fileinfo.surfreference==undefined),
				roi: 1,
			};
			
			markerPanel.freeView.setContent( that.fileObject, {  intent: intent } );
			// would like to set the cuts here, but that is not so easy .... ideally, must go over the intent and implement properly
			//markerPanel.freeView.medViewer.objects3D.cuts;
			window.setTimeout( calcAndSetStatistics,0 );
		}

		if(forceshow)
			markerPanel.freeView.$container.show();


	}


	// updateROI will take care of everything (create new if requested, put into viewports ...)
	updateROI();
	// will be called later anyhow by movepoint / setsize

//	that.setThisPointInto3DView();


	return that;

} // END OF KMarkerTool







// ======================================================================================
// calcInertiaTensor
// ======================================================================================
function calcInertiaTensor(nii, img)
{
	// nii = the roi in this case, img is the background image
	if(img!=undefined)
		var A = math.multiply(math.inv(img.edges), nii.edges);

	// center of mass
	var sx = nii.sizes[0];
	var sy = nii.sizes[1];
	var sz = nii.sizes[2];
	var volPerVox = nii.voxSize[0] * nii.voxSize[1] * nii.voxSize[2];

	var currentIndex, val;
	var center = [0,0,0];
	var totsum = 0;
	for(var x=0; x<sx; x++)
	{
		for(var y=0; y<sy; y++)
		{
			for(var z=0; z<sz; z++)
			{
				currentIndex = sx*sy*z +y*sx + x;
                val = nii.data[currentIndex];
				center[0] += val* nii.voxSize[0]*x;
				center[1] += val* nii.voxSize[1]*y;
				center[2] += val* nii.voxSize[2]*z;
				totsum += val; 
			}

		}
	}

	center[0] /= totsum;
	center[1] /= totsum;
	center[2] /= totsum; 

	var calcmedian = true;
    var values = [];
	var imgtotsum0 = 0;
	var imgtotsum2 = 0;
	var median = 0;
	var mean  = 0;
	var std = 0;

	// inertie Tensor http://en.wikipedia.org/wiki/Tensoror
	var T = new Float32Array(9);
	T.fill(0);
	var dx,dy,dz;
	
	//diameter
	var calcMaxDiameter = true;
	var diameter = 0; 
	var firstPoint = [0,0,0]; 
	var secondPoint = [0,0,0];
	//set borderpixels: 
	var border = []; 
	for (var i = 0; i <sx*sy*sz; i++){
		border[i] = new Array(3); 
	}
	var count = 0; 
	var voxcount = 0;
	var biggestDistance = 0;
	// end diameter

	for(var x=0; x<sx; x++)
	{
		for(var y=0; y<sy; y++)
		{
			for(var z=0; z<sz; z++)
			{
				currentIndex = sx*sy*z + y*sx + x;
                val = nii.data[currentIndex];
                
                if(val<1)
                	continue

                voxcount++;
                	
				dx = x*nii.voxSize[0] - center[0];
				dy = y*nii.voxSize[1] - center[1];
				dz = z*nii.voxSize[2] - center[2];
                T[0] += val*(dy*dy + dz*dz );
                T[1] += val*(-dx*dy );
                T[2] += val*(-dx*dz );
                T[3] += val*(-dy*dx );
                T[4] += val*(dx*dx + dz*dz );
                T[5] += val*(-dy*dz );
                T[6] += val*(-dz*dx );
                T[7] += val*(-dz*dy );
                T[8] += val*(dx*dx + dy*dy );
 				
 				if(val> 0 && calcmedian)
 				{
					var v = NNInterp(img, x, y, z, A._data, 0);
					v = img.datascaling.e(v);
					if (!isNaN(v) && v !== 0 )
					{
                		values.push(v);
                	    imgtotsum0 += v; 
                	    imgtotsum2 += v*v; 
					}
 				}


				// ******* diameter
				if(val> 0 && calcMaxDiameter)
				{
					// check for edge pixels
					if(nii.data[currentIndex -1] < 1 || 
						nii.data[currentIndex + 1] <1 || 
						nii.data[currentIndex - sx] <1 || 
						nii.data[currentIndex + sx] <1 || 
						nii.data[currentIndex + sx*sy] <1 || 
						nii.data[currentIndex - sx*sy] <1)
					{
						border[count][0] = x; 
						border[count][1] = y; 
						border[count][2] = z; 

						var vec = [border[count][0] * nii.voxSize[0] , border[count][1] * nii.voxSize[1] , border[count][2] * nii.voxSize[2] ]; 
						for(var k = 0; k < count; k++)
						{
							var vec2 = [border[k][0] * nii.voxSize[0] , border[k][1] * nii.voxSize[1] , border[k][2] * nii.voxSize[2] ]; 
							var distance = math.sqrt((vec[0] - vec2[0])*(vec[0] - vec2[0])+(vec[1] - vec2[1])*(vec[1] - vec2[1]) +(vec[2] - vec2[2])*(vec[2] - vec2[2])); 
							if(distance > biggestDistance)
							{
								biggestDistance = distance;
								firstPoint = border[count]; 
								secondPoint = border[k];  
								//TODO: check points 
							}
						}
						count = count +1; 
					}
				}
					// end diameter
			}

		}
	}

	if(calcmedian)
	{
		median = math.median(values);
		mean    = imgtotsum0/values.length;  
		std    = math.sqrt( imgtotsum2/values.length -mean*mean ) ;  
	}

	//console.log(T);

	T = math.matrix( [ [T[0],T[1],T[2]], [T[3],T[4],T[5]], [T[6],T[7],T[8]]]);
	T = math.multiply(T, 1/totsum/1);
	
	var EV = kmath.maxEV3(T);

	
	// the mass ellipsoid is defined as follows https://de.wikipedia.org/wiki/Tr%C3%A4gheitsellipsoid#Massenellipsoid
	// this would be the corresponding ellipsoid with the half axes 0,1,2, therefore times 2
	var main0 = math.sqrt( 5/2* (EV[1].ev + EV[2].ev - EV[0].ev) ) * 2;
	var main1 = math.sqrt( 5/2* (EV[0].ev + EV[2].ev - EV[1].ev) ) * 2;
	var main2 = math.sqrt( 5/2* (EV[0].ev + EV[1].ev - EV[2].ev) ) * 2;


	// collect the results
	var vol = voxcount * volPerVox / 1000; // in mL
	//var shortdiam = (main0+main1)/2; // this is the shortest diam

	if(calcMaxDiameter)
		diameter = biggestDistance;
	else
		diameter = false;

	//fobj.fileinfo.surfreference

	var out = 
	{
		volume: vol,
		mainAx0: main0,
		mainAx1: main1,
		mainAx2: main2,
		diameter:diameter,
		firstPoint: firstPoint, 
		secondPoint: secondPoint,
		//border: border,
		median:median,
		mean:mean,
		std:std 
	};


	if(0)
	{
		console.log('........')
		console.log('C' + center);
		console.log(EV[0]);
		console.log(EV[1]);
		console.log(EV[2]);
		console.log('nvoxels' + totsum);

	}
	return out;

}


// ======================================================================================
// polygon functions
// ======================================================================================

// helper functions for polygon operations
function kp_vsum(a,b,s)
{
	/*
	*******************************************************/
	// add two vectors, one scaled by s. sets forth dim  to one (assume affine then)
	// can also add list of vectors, 
	if(a==undefined || b==undefined)
		console.log(a);
	if(s==undefined)
		s=1;

	var a_isArray = Array.isArray(a[0]);
	var b_isArray = Array.isArray(b[0]);

	if(a_isArray && b_isArray)
	{
		var is_affine = a[0].length ==4;
		var vv = [];
		for(var k=0; k<a.length; k++)
		{
			var temp = [a[k][0] + s*b[k][0], a[k][1] + s*b[k][1], a[k][2] + s*b[k][2]];
			// affine?
			if(a.length ==4)
				temp.push(1)
			vv.push(temp);
		}

	}
	else if(a_isArray &&  !b_isArray)
	{
		var is_affine = a[0].length ==4;
		var vv = [];
		for(var k=0; k<a.length; k++)
		{
			var temp = [a[k][0] + s*b[0], a[k][1] + s*b[1], a[k][2] + s*b[2]];
			// affine?
			if(is_affine)
				temp.push(1)
			vv.push(temp);
		}

	}    
	else if(!a_isArray &&  !b_isArray)
	{
		var is_affine = a.length ==4;
		var vv = [a[0] + s*b[0], a[1] + s*b[1], a[2] + s*b[2]];
		// affine?
		if(is_affine)
			vv.push(1)
	}
	else
	{
		console.log("size mismatch");
	}

	return vv;
}


/********************************************************/
// find min value of a vector (optional based on abs)
function kp_vec_min(a, useabs)
{

	if(useabs == 1)
	{
		var b = [];
		for (var k = 0; k < a.length; k++)
		{
			b.push(math.abs(a[k]));
		}
		a=b;

	}
	var m=[a[0]];
	var ind = 0;
	for (var k = 1; k < a.length; k++)
	{
		if (m > a[k])
		{
			m = a[k];
			ind = k;
		}
	}
	return {val: m, ind: ind};
}
/********************************************************/



/******************************************************************
interpolate a list of parallel polygons
******************************************************************/
KMarkerScribble_interpolate_slices = function( mset )
{

	function calc_center_of_mass(vertices_in, normalvec)
	{
		var vertices=[];
		for(var k=0; k<vertices_in.length; k++)
		{
			vertices.push(vertices_in[k]);
		}
		// close polygon
		vertices.push(vertices[0]);

        var s = [0,0,0];
        var areaTotal = 0.0;

        var p1 = vertices[0];
        var p2 = vertices[1];
        // quad sum of all vertices, for slice norm vec calculation
        var ss = [0,0,0];

        for (var i = 2; i < vertices.length; i++)
        {
            var p3 = vertices[i];
            var edge1 = kp_vsum(p3, p1, -1);
            var edge2 = kp_vsum(p3, p2, -1);
			
            var crossProduct = kmath.cross(edge1, edge2)._data;
            var area = kmath.norm(crossProduct)/2;
			var enorm = math.norm(edge2)
            ss[0] += math.abs(edge2[0]/enorm)
            ss[1] += math.abs(edge2[1]/enorm)
            ss[2] += math.abs(edge2[2]/enorm)
	
            s[0] += area * (p1[0] + p2[0] + p3[0])/3;
            s[1] += area * (p1[1] + p2[1] + p3[1])/3;
            s[2] += area * (p1[2] + p2[2] + p3[2])/3;

            areaTotal += area;
            p2 = p3;
            if(normalvec == undefined && math.norm(crossProduct) > 0.01)
            	normalvec = math.multiply(crossProduct , 1/ math.norm(crossProduct) )._data;; 
        }

        var com = [s[0]/areaTotal, s[1]/areaTotal, s[2]/areaTotal   ];
		var vertices_cc = kp_vsum(vertices, com, -1); // center-of-mass free poly
        var dist_to_origin = math.dot(normalvec, com );

        return {com: com, area: areaTotal, vertices: vertices, vertices_cc, normalvec: normalvec, dist_to_origin: dist_to_origin};
    
	}
	//return console.log( calc_center_of_mass([[0,0,0], [1,1,0], [1,-1,0]]) );



	var that = {};

    /******************************************************
    Main function
	*******************************************************/
	mset =  mset || markerProxy.currentSet;
	var points = mset.getPoints();

	if(points.length < 2)
	{
		alert("must have a least 2 scribble - polygons");
		return
	}
	
	// prepares: calc center of mass of all polygons and find slice normal vectors
	var tlist = []; // list of all polys
	var dlist = [];
	for(var k=0; k<points.length; k++)
	{
		if(k==0) // re-use the first normal vec of first slice, otherwise direction might change...
			var temp = calc_center_of_mass(points[k].subpoints);
		else
			var temp = calc_center_of_mass(points[k].subpoints, tlist[k-1].normalvec);


		tlist.push(temp);
		dlist.push(temp.dist_to_origin)
	}
	var sortind = Array.from(Array(dlist.length).keys()).sort((a, b) => dlist[a] < dlist[b] ? -1 : (dlist[b] < dlist[a]) | 0)	
//	var sortind = Array.from(Array(dlist.length).keys()).sort((a, b) => dlist[a] < dlist[b] ? -1 : 1)	

	// as nifti, choose the one it was created on
	var fileobj = KViewer.dataManager.getFile(points[0].referencedImageFileID);
	nii = fileobj.content;

	
	for(var k=1; k<sortind.length; k++)
	{
		do_it(sortind[k], sortind[k-1])
	}
		

	function do_it( ind1, ind2 )
	{

 		var has_greater_area = tlist[ind1].area > tlist[ind2].area;
 		if(!has_greater_area)
 			{var dummy = ind1; ind1=ind2; ind2=dummy;}

 		var dist_to_last_slice = math.abs( tlist[ind1].dist_to_origin - tlist[ind2].dist_to_origin );
	
		
		var poly0 = tlist[ind1].vertices;
		var poly1 = tlist[ind2].vertices;
		var poly0cc = tlist[ind1].vertices_cc;
		var poly1cc = tlist[ind2].vertices_cc;


		/************************************
		 "Algorithm" to interpolate between 2 polygons:
		 - calc center of masses and subtract
		 - choose poly with larger area as starting points
		 - connect each point to COM of 2nd poly and find intersections.
		 - choose intersection, or closest point to intersections
		 - alternative: connect to closest point of 2nd polygon
		*/
		var up_vector = tlist[ind1].normalvec;

		up_vector.push(1);

		/***************************************************/
		// iterate all points of source polygon
		var len = poly0.length;


		var method = "closest"
		var method = "centerofmass"

		var targetpoly = [];

		if(method == "closest")
		{
			for(var k=0; k<poly0.length; k++)
			{
				var dists = [];
				for(var u=0; u< poly1.length; u++)
				{
					var d0 = math.norm(kp_vsum(poly1cc[u]  , poly0cc[k], -1) );
					dists.push(d0);
				}

				var themin = kp_vec_min(dists);
				var bestpoint = poly1[themin.ind];

				targetpoly.push(bestpoint)
			}
		}
		else // method 2: intercect with plane defined by point=>centerofmass
		{
			var equalize_com = 1;

			if (equalize_com)
			{
				var centerpoint = [0,0,0];
			}
			else
			{
				poly0cc = poly0;
				poly1cc = poly1;
				var centerpoint = com1;
			}


			for(var k=0; k<poly0cc.length; k++)
			{
				// calc normal vec for plane: current point => center of mass
				var p0 = poly0cc[k];
				var v1 = kp_vsum(p0, centerpoint, -1);
				var n = math.cross(up_vector, v1, 1)._data;

				var v1 = kp_vsum(p0,centerpoint, -1);
				var dummy = k + math.round(len/2);
				if(dummy >= len)
					dummy -=len;
				var v2 = kp_vsum(poly0cc[dummy],centerpoint, -1);

				var up_vector = math.cross(v1, v2, 1)._data;

				var n = math.cross(up_vector, v1, 1)._data;

				// now, intersect with all edges of second polygon, find closest points
				var isec = {};
				isec.dists = [];
				isec.inds  = [];
				isec.secpoints = [];
				//isec.orients = [];

				for(var u=1; u< poly1.length; u++)
				{
					var d0 = math.dot(n, kp_vsum(poly1cc[u]  , centerpoint, -1) );
					var d1 = math.dot(n, kp_vsum(poly1cc[u-1], centerpoint, -1) );
					if(d0*d1 <=0 ) // intersection means: both points are on different sides of plane
					{
						var secpoint = kp_vsum(poly1cc[u], n, -d0)
						// calc dist to source point
						if(0)
						{
							isec.dists.push(math.abs(d0));
							isec.dists.push(math.abs(d1));
						}
						else
						{
							var d0_tosourcepoint = kmath.norm(kp_vsum(poly1cc[u-1], p0, -1 ))
							var d1_tosourcepoint = kmath.norm(kp_vsum(poly1cc[u], p0, -1 ))
							isec.dists.push(d0_tosourcepoint);
							isec.dists.push(d1_tosourcepoint);
						}

						// normally, there should be 2 +2*x intercections, one closer. 
						// calc orientation of inercections with respect to plane perp to n
	// 					var sec_n = math.cross(up_vector, n, 1)._data;
	// 					var orient = math.dot(sec_n, kp_vsum(secpoint, centerpoint, -1) );
	// 					isec.orients.push(orient)

						isec.inds.push(u-1);
						isec.inds.push(u);
						isec.secpoints.push(secpoint);
						isec.secpoints.push(secpoint);
					}
				}

				if(isec.secpoints.length == 0)
					continue

				//console.log("orients: " + isec.orients)
	// 			var prod = 1;
	// 			var mino = isec.orients[0]
	// 			var maxo = isec.orients[0]
	// 			for(var u=0; u<isec.orients.length; u++)
	// 			{
	// 				prod *= isec.orients[u];
	// 			}
	// 			console.log("prod = "+ prod)

	// 			if(prod > 0)
	// 				var themin = kp_vec_min(isec.dists);
	// 			else
	// 				var themin = kp_vec_min(isec.dists);

					var themin = kp_vec_min(isec.dists);

				// calculate /set  the target point
				// option 1: choose target
				var bestpoint = poly1[isec.inds[themin.ind]]; // choose target
				// option 2: intersection point
				//var bestpoint =  isec.secpoints[themin.ind];
	// 			if(equalize_com)
	// 				bestpoint = kp_vsum(bestpoint, com1, 1);
				targetpoly.push(bestpoint);
			}

		}

		/************************************
		 add interpolated polygons
		************************************/
		// how many interpolation polys do we want to have? one for each slice
		zvec = [0,0,1,1];
		var SS = nii.spaceDirections;
		var n = tlist[ind1].normalvec;
 		var proj = math.multiply([ SS[0],SS[1],SS[2] ], n)._data;
		var nsteps = dist_to_last_slice / math.norm(proj) ;
		nsteps = math.round(nsteps)-1;
// 		console.log(proj);
// 		console.log(nsteps);

		var debug = 0;
		for(var s=0; s<nsteps; s++)
		{
			var temppoly = [];
			for(var k=0; k<targetpoly.length; k++)
			{
				if(debug)
					temppoly.push(poly0[k]);
				var fac = (s+1)/(nsteps+1);
				
				var newpoint = kp_vsum(poly0[k], kp_vsum(targetpoly[k], poly0[k], -1), fac);
				//newpoint = vsum(newpoint, proj, 1);
				temppoly.push( newpoint );
				

				if(debug)
					temppoly.push(poly0[k]);
			}	

			var p = mset.addpoint(temppoly[0], undefined, undefined,  {hideMarkerRepresentation: 1});
			p.referencedImageFileID = points[0].referencedImageFileID;
			p.subpoints = temppoly;

		}
	}
	markerProxy.currentSet.markerPanel.update();
	markerProxy.currentSet.drawAllPoints();
	return false;


}

/******************************************************************
fill a polygon (or a list of polygons) to a ROI
******************************************************************/
function fillPolygon(point,nii, addToHistory)
{

	var poly = point.subpoints;

	// for blocking mode, we need the medviewer to calculate other rois
	//if(point.$markers.length > 0 )
		var medViewer = point.$markers[Object.getOwnPropertyNames(point.$markers)[0]].medViewer;
// 	else
// 		var medViewer = undefined


	var valtoset = 1;


	if (nii.invedges == undefined)
		nii.invedges = math.inv(nii.edges);	

	var polyvox = [];
	var sums = [0,0,0];
	var lastpvox;
	for(var k=0; k<poly.length; k++)
	{
		var pvox = math.multiply(nii.invedges, poly[k])._data;
		polyvox.push([math.round(pvox[0]), math.round(pvox[1]), math.round(pvox[2])  ]  );
		//polyvox.push([(pvox[0]),(pvox[1]), (pvox[2])  ]  );
		if(k==0)
			lastpvox = pvox;
		else
		{
			sums[0] += (lastpvox[0]-pvox[0])*(lastpvox[0]-pvox[0]);
			sums[1] += (lastpvox[1]-pvox[1])*(lastpvox[1]-pvox[1]);
			sums[2] += (lastpvox[2]-pvox[2])*(lastpvox[2]-pvox[2]);
			lastpvox = pvox;
		}
	}
	polyvox.push( polyvox[0] );
	// find the best slicing
	// find the poly normal vector
	
	var temp = kp_vsum(polyvox[1], polyvox[0],-1);
	var themin = kp_vec_min(sums, 1);
	var minind = themin.ind;
	var slicepos = polyvox[0][themin.ind]

	var polyvox2DA 	 = [];
	var polyvox2DX 	 = [];
	var polyvox2DY 	 = [];
	var polyvox2DS = [];

	for(var k=0; k<polyvox.length; k++)
	{
		if(minind==0)
		{
			polyvox2DA.push([polyvox[k][1], polyvox[k][2]])
			polyvox2DX.push(polyvox[k][1])
			polyvox2DY.push(polyvox[k][2])
			polyvox2DS.push(polyvox[k][1])
			polyvox2DS.push(polyvox[k][2])
		}
		else if(minind==1)
		{
			polyvox2DA.push([polyvox[k][0], polyvox[k][2]])
			polyvox2DX.push(polyvox[k][0])
			polyvox2DY.push(polyvox[k][2])
			polyvox2DS.push(polyvox[k][0])
			polyvox2DS.push(polyvox[k][2])
		}
		else if(minind==2)
		{
			polyvox2DA.push([polyvox[k][0], polyvox[k][1]])
			polyvox2DX.push(polyvox[k][0])
			polyvox2DY.push(polyvox[k][1])
			polyvox2DS.push(polyvox[k][0])
			polyvox2DS.push(polyvox[k][1])
		}
		//polyvox.push(pvox);
	}
	var minX = Math.min.apply(null, polyvox2DX)
	var maxX = Math.max.apply(null, polyvox2DX)
	var minY = Math.min.apply(null, polyvox2DY)
	var maxY = Math.max.apply(null, polyvox2DY)

	// iterate voxel space
	var changedPoints = [];

	//return false;
	var tOffset = 0;
	if (nii.currentTimePoint)
		   tOffset = nii.currentTimePoint.t * nii.widheidep;

    var f = PolyK.ContainsPointFast(polyvox2DS);
	for (var x = minX; x < maxX; x += 1)
	{
		for (var y = minY; y < maxY; y += 1)
		{
			var isin = f(x, y);
			if (isin)
			{
				if(minind==0)
					var currentVoxel = [slicepos,x,y,1];
				else if(minind==1)
					var currentVoxel = [x,slicepos,y,1];
				else if(minind==2)
					var currentVoxel = [x,y,slicepos,1];

				var currentIndex = nii.sizes[0] * nii.sizes[1] * currentVoxel[2] + currentVoxel[1] * nii.sizes[0] + currentVoxel[0] + tOffset;
 				if (nii.data[currentIndex] != valtoset)
 					changedPoints.push(currentIndex);

				nii.data[currentIndex] = valtoset;
			}
			//console.log(isin);
		}
	}

	KViewer.roiTool.keepExclusive(changedPoints,medViewer,{})


	if(addToHistory && changedPoints.length>0)
	{
	    KViewer.roiTool.history.record('startRecording');
        KViewer.roiTool.history.add(changedPoints, valtoset);
	    KViewer.roiTool.history.record('stopRecording');
	}
	
	return {changedPoints: changedPoints};
}
