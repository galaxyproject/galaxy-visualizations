
// ======================================================================================
// ======================================================================================
// ============= KNAvigationTool
// ======================================================================================
// ======================================================================================
 
function KNavigationTool(master) 
{
  /** the tool to transform/rotate/translate images
   * @class 
   * @alias KNavigationTool
   * @augments KToolWindow
   */
  var that = new KToolWindow(master,
  $("<div class='KView_tool '><i class='fa fa-comment-o fa-1x'></i></div>")
  .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Navigation</li>") ))
  );
  that.name = 'Navigation';
/*
 that.handleDrop = function(e)
  {
  
    e.preventDefault();
    e.stopPropagation();

	createLoadParamsFileDrop(e, function (loadparams)
	{
		for (var k = 0; k < loadparams.length;k++)
		{
		  loadparams[k].progressSpinner = that.progressSpinner;		 
  		  loadparams[k].callback = function(fileObject) {
     		if(fileObject.contentType == 'json')
			   if (fileObject.fileinfo.Tag.search("RO") >= 0)
				 master.setReorientationMatrix(fileObject);
			KViewer.cacheManager.update();
			that.transform.update();
			that.progressSpinner();
			}
		  KViewer.dataManager.loadData(loadparams[k]);
		 }
	 },that.progressSpinner);
  
  }
  */
  that.$container[0].ondrop = ondrop;
  that.$container.on("dragover",function(e)
  {
  	return false;
  });


  that.attach_helper(function(){
		window.open("https://www.nora-imaging.org/doc/books/nora-documentation/page/navigation-tool-%28alignment-and-deformations%29",'_blank');  	
  })

  /***************************************************************************************
   *  The navigation modes 
   ****************************************************************************************/

  function naviMenu()
  {
       var modes = {solid:2,coreg:0,resl:1}; var keys = invertObject(modes);
	   var $menu = $("<ul>");
       $menu.append($("<li onchoice='"+keys[2]+"'><a>Transform </a> <i class='"+keys[2]+" fa fa-check-square-o'></i></li>"));
     //  $menu.append($("<li onchoice='"+keys[0]+"'><a>Coregister </a> <i class='"+keys[0]+" fa fa-check-square-o'></i></li>"));
       $menu.append($("<li onchoice='"+keys[1]+"'><a>Reslice</a> <i class='"+keys[1]+" fa fa-check-square-o'></i></li>"));
	   var selFun =  function(ev)
	   {
			ev.preventDefault();
			ev.stopPropagation();
			var str = $(ev.target).parent().attr("onchoice");
			if (modes[str] != undefined)
			   that.switchToNavimode(modes[str]);
			if (str != undefined | ev.type == "mousedown")
				$(document.body).off("mouseup mousedown");
	   } 

	   that.switchToNavimode = function (m)
	   {
			$menu.find(".fa").removeClass("fa-check-square-o").addClass("fa-square-o");
			$menu.find("." + keys[m]).addClass("fa-check-square-o").removeClass("fa-square-o");
			if (m==2 | m==1)
			{
			//	dropapply.$dragarea.hide()
				if(that.$applybutton)
					that.$applybutton.hide();
			}
			else
			{
				dropapply.$dragarea.show()
				that.$applybutton.show();
			}

			if (m == 0 | m==2)
			{
				KViewer.currentTilts(0,0).v = 0;
				KViewer.currentTilts(0,1).v = 0;
				KViewer.currentTilts(1,0).v = 0;
				KViewer.currentTilts(1,1).v = 0;
				KViewer.currentTilts(2,0).v = 0;
				KViewer.currentTilts(2,1).v = 0;

				KViewer.reorientationMatrix.type = m;
				that.toggleActive(true);
			}
			else
				that.toggleActive(false);
			master.navigationMode = m;
			signalhandler.send("positionChange");
	   }

	   $menu.on("mousedown", selFun);
	   return $menu;
	   

  }



  signalhandler.attach("close",function()
  {
	  	that.movingObjs ={};
  		that.updateMoving();
		resetTransform();
		if (KViewer.mainViewport == 'world')
		    KViewer.toggleMainViewport('world');

  })



  function resetTransform()
  {
	  that.transform.$toggle.removeClass('KViewPort_tool_enabled');  	
  	  KViewer.reorientationMatrix.deffield = undefined;
	  KViewer.reorientationMatrix.matrix =  math.matrix(math.diag([1,1,1,1]));
       KViewer.reorientationMatrix.notID = false;

  	  that.deffield_extern = undefined;
 	  that.transform.$info.text("warp:id")
      that.transform.clearallCorrespondence()

      that.transform.update() ;
  	  signalhandler.send("reslice");
  }
  that.resetTransform = resetTransform

  function saveTransform()
	{


      saveDialog("affine transform",
	  function(name,finfo)
			{
				KViewer.reorientationMatrix.name = name;
				var mat =math.inv(KViewer.reorientationMatrix.matrix)._data
				finfo.subfolder = "transforms"
				finfo.tag = "RO"

				uploadJSON(name,{matrix: KViewer.reorientationMatrix.matrix._data},finfo,function (fobj,saveobj)
				{
				   if (saveobj != undefined)
				   {

                        var content = "#Insight Transform File V1.0\n"+
 									"#Transform 0\n"+
									"Transform: AffineTransform_float_3_3\n"+
									"Parameters: "+([mat[0][0],mat[0][1],-mat[0][2],
									                mat[1][0],mat[1][1],-mat[1][2],
									                -mat[2][0],-mat[2][1],mat[2][2],
									                -mat[0][3],-mat[1][3],mat[2][3]].join(" "))+"\n"+"FixedParameters: 0 0 0\n";


						var finfo = 
						{
							 patients_id : saveobj.patients_id,
							 studies_id : saveobj.studies_id,
							 SubFolder:"transforms",
							 Tag:"itk",
							 permission:"rwp"
						};

						var obj = {
							filename: name+".itk.aff.txt",
							content: content ,
							fileID: "",
							fileinfo:finfo,

						}				   	

         		       uploadBinary(obj,{},function(){
         		       	                    patientTableMirror.mirrorState();
         		       },that.progressSpinner,undefined,1);				
				   }


				})

 		  } );
	}


  /***************************************************************************************
   *  The transform menu
   ****************************************************************************************/


  function reorientationMenu()
  {

	   var $menu = $("<ul>");
       $menu.append($("<li onchoice='scale'><a>Scale</a></li>"));
       $menu.append($("<li onchoice='flipx'><a>Flip X </a></li>"));
       $menu.append($("<li onchoice='flipy'><a>Flip Y</a></li>"));
       $menu.append($("<li onchoice='flipz'><a>Flip Z</a></li>"));
       $menu.append($("<li onchoice='cycle'><a>Cycle permute</a></li>"));
       $menu.append($("<li onchoice='pari'><a>Change Parity</a></li>"));
       $menu.append($("<li onchoice='invert'><a>Invert</a></li>"));


       $menu.append($("<li onchoice='reset'><a>Reset Affine</a></li>"));
       $menu.append($("<li onchoice='save'><a>Save Affine</a></li>"));

	   var selFun = function() { return function(ev)
			   {
					ev.preventDefault();
			   		ev.stopPropagation();
					var str = $(ev.target).parent().attr("onchoice");
					if (str=="reset")
                       resetTransform();
					else if (str=="save")
					    saveTransForm();
					else
                    {	
                          var vp = KViewer.mainViewport;
                          if (vp == -1)
                              vp = 0;
  						  var mnii = KViewer.viewports[vp].medViewer.nii;
       					  var edges = math.multiply(1,mnii.edges);
						  edges = math.multiply(edges,permMat(mnii));

       					  var T = transMat(math.multiply(math.inv(edges),math.multiply(math.inv(KViewer.reorientationMatrix.matrix), KViewer.currentPoint._data)));			 
					      var E = math.multiply(edges,T);
						
						  if (str == 'invert')
						  {
							  KViewer.reorientationMatrix.matrix = math.inv(KViewer.reorientationMatrix.matrix);
						  }
						  else
						  {
							  var R;
							  if (str == 'scale')
							  {
									alertify.prompt("Please enter scale factor (one number of isotropic scaling, three comma separated number of anisotropic scaling)",function (e,str) {
									if (e)
									{   
										var s = parseFloat(str);
										var s = str.split(",").map(parseFloat);
										if (s.length == 3)
										{
											s.push(1)
										}
										else
										{
											s = [s[0],s[0],s[0],1];
										}
										R = math.diag(s); 
										KViewer.reorientationMatrix.matrix = math.multiply(KViewer.reorientationMatrix.matrix, math.inv(math.multiply(E,math.multiply(R,math.inv(E)))));
										  signalhandler.send("reslice");
										  signalhandler.send("positionChange");

									}},"1");
                                    return							  	
							  }
							  if (str == 'flipx')
								 R = math.diag([-1,1,1,1]);
							  if (str == 'flipy')
								 R = math.diag([1,-1,1,1]);
							  if (str == 'flipz')
								 R = math.diag([1,1,-1,1]);
							  if (str == 'cycle')
								 R = math.matrix([[0,1,0,0],[0,0,1,0],[1,0,0,0],[0,0,0,1]]);
							  if (str == 'pari')
								 R = math.matrix([[0,0,1,0],[0,1,0,0],[1,0,0,0],[0,0,0,1]]);

							  KViewer.reorientationMatrix.matrix = math.multiply(KViewer.reorientationMatrix.matrix, math.inv(math.multiply(E,math.multiply(R,math.inv(E)))));
						  } 
                          signalhandler.send("reslice");
                          signalhandler.send("positionChange");
                         // KViewer.resetCrossHair();
                    }
                    

					if (str != undefined | ev.type == "mousedown")
					{
						$(document.body).off("mouseup mousedown");
					}

			   }
	   }();

	   $menu.on("mousedown", selFun);
	   return $menu;
  }


  /***************************************************************************************
   *  are we in interpolation mode?
   ****************************************************************************************/

  that.toggleActive = function(on)
  {
  	 var fun;
  	 if (on != undefined)
 		fun = on?(function (x,c) { x.removeClass(c);}):(function (x,c) { x.addClass(c);});
  	 else
 		fun = function (x,c) { x.toggleClass(c);} 		
  	 fun(that.$topRow.find(".turnable"),"menu_generic_disabled"); 	 
     fun(that.transform.$div,"inactive");
    
     that.updateMasterCaption();
  }

  that.updateMasterCaption = function()
  {
     if (master.mainViewport == -1)
         mastercap.$master.text("gridding:");
     else
     {
		 var master_ = master.viewports[master.mainViewport].medViewer;
		 mastercap.$master.text("gridding: " + master_.currentFilename);
     }
  }

  that.$topRow.append( $("<li ><a>Navigation</a></li>").append(naviMenu() ));
  that.$topRow.append( $("<li class='menu_generic_disabled turnable'><a>Affine</a></li>").append(reorientationMenu() ));
  var $listDIV = $("<div class='annotation_tool_listDIV'></div>").appendTo(that.$container);

 

  that.resize = function(hei)
  {
     that.$container.height(hei);
  }


  /***************************************************************************************
   *  That's the crosshair
   ****************************************************************************************/

  var crosshair = function ()
  {
     var systemList = {
         RAS: {mat: math.matrix( math.diag([1,1,1,1])), captions: ['LR', 'PA', 'IS']}      // this is the normal NIFTI System
        ,LPI: {mat: math.matrix( math.diag([-1,1,-1,1])), captions: ['RL', 'PA', 'SI']} // this is the LEKSELL System: hinten oben rechts ist negativ
      }
     var currentSystem = systemList.RAS;  // default system for normal / alternative

  	 var crosshair = {};	  
     crosshair.$captionBar = $("<div></div>").append( $("<div class='annotation_tool_caption' style='flex-grow:1;font-weight:bold'> current coordinate </div>") );
	 crosshair.$div = $("<div class='annotation_tool_elemDIV'></div>").appendTo($listDIV);
     crosshair.$captionBar.appendTo(crosshair.$div)  ;
     var $table  = $("<table></table>").appendTo(crosshair.$div);
    

      var $systemSelector = $('<select></select>').on('change', function()
        { currentSystem = systemList[$(this).val()];
        //  that.parent.annotations.forEach(function(e)  { if(e.points.length > 0)
         // { 
         //   e.points.forEach(function(z,k){e.movepoint( z.coords, k)}); } 
         // } );
         // setDirCaptions();
        }  );
      Object.keys(systemList).forEach( function(e)  {  $('<option>'+e+'</option>').val( e ).appendTo($systemSelector)  } );
      crosshair.$captionBar.append($("<div>").append($systemSelector) );

        //var $sel =
        $table.append( $("<tr></tr>")
            .append( $("<th colspan=3></th>").append($('<span>&nbsp;&nbsp;Alternative  &nbsp;&nbsp;  System&nbsp;</span>'))    )
            .append("<th></th>")
            .append( $("<th colspan=3></th>").append($('<span>World System</span>'))  )
          );

        var $dirCaptionsTR = $("<tr></tr>").appendTo($table);
        function setDirCaptions()
        {
            var captions = currentSystem.captions;
            $dirCaptions =  $("<th>"+captions[0]+"</th><th>"+captions[1]+"</th><th>"+captions[2]+"</th><th></th><th>"+captions[0]+"</th><th>"+captions[1]+"</th><th>"+captions[2]+"</th>");   
            $dirCaptionsTR.empty();
            $dirCaptionsTR.append($dirCaptions).append( $("<th></th>") );
       }
        setDirCaptions();



       var coords = [0,0,0,1];
       var $row  = $("<tr></tr>");
       for(var k=0;k<3;k++)
          $("<td><input type = 'number' value='"+ coords[k].toFixed(1) +"' /></td>").appendTo($row).on('change', onInputFieldChange);
       coords = math.multiply( math.inv(master.reorientationMatrix.matrix), coords)._data ; // go to reoriented system
       $("<td></td>").appendTo($row) ;
       for(var k=0;k<3;k++)
          $("<td><input type = 'number' value='"+ coords[k].toFixed(1) +"' /></td>").appendTo($row).on('change', onInputFieldChange);
       $("<td><input type='text' class='KAnnotationTool_comment' value='' /></td>").appendTo($row) ;
       var $tools = $("<div class='annotation_tool_elemDIV_toolbar'></div>");
       var inputs = $row.find("input");

       $row.appendTo( $table );


       function update()
	   {
			function setVals(inputs,coords,offs)
			{
				for(var k=0;k<3;k++)   
				   inputs[k+offs].value =  coords._data[k].toFixed(3);   				
			}
			var mat = KViewer.reorientationMatrix.matrix;
			var coords = math.multiply(math.inv( mat),master.currentPoint);
			setVals(inputs,math.multiply(math.inv( mat),master.currentPoint),0)
 	 	    setVals(inputs,master.currentPoint ,3)
	   }
	   signalhandler.attach("positionChange",update);

	   function onInputFieldChange(event)
	   {	   	  
   		   var coords = [ parseFloat( inputs[0].value), parseFloat( inputs[1].value ), parseFloat( inputs[2].value ),1   ];
   		   var mat = KViewer.reorientationMatrix.matrix;
           coords = math.multiply(mat, coords ); // apply RAS or other
           master.currentPoint = math.matrix( coords );
           signalhandler.send("positionChange");
	   }

	   return crosshair;
    }();


 /*****************************************************************************************
  *  Show who the master is, or decide for world
  ****************************************************************************************/


  var mastercap = function ()
  {
  	 var mastercap = {};	  
 //$("<div class='annotation_tool_elemDIV_tools'></div>") 
     mastercap.$worldToggle =  $("<i class='fa fa fa-1x'> <span>WORLD</span> </i>").click(worldMaster);
     mastercap.$toolToggle =  $("<div class='annotation_tool_elemDIV_tools' class='KViewPort_tool'></div>").append(mastercap.$worldToggle);
//     mastercap.$worldToggle =  $("<div myid='KViewPort_tool_toggleMainViewport' class='KViewPort_tool'><i class='fa fa fa-1x'> WORLD </i></div>");
   
 	 var voxsz = eval(state.viewer.worldVoxelsize); 	 
 	 val = 1;
 	 if (voxsz != undefined && voxsz[0] != undefined)
 	 	val = voxsz[0];
 	 	
     mastercap.$voxsz = $("<div class='annotation_tool_elemDIV_tools' > world voxsz: <input style='width:40px;' type = 'number' value='"+val+"' min='0.1' max='2' step='0.1' /> </span>");
     mastercap.$master = $("<div class='annotation_tool_caption' style='flex-grow:1;font-weight:bold'> gridding: </span>");
     mastercap.$captionBar = $("<div></div>").append( mastercap.$master )
     										 .append( mastercap.$voxsz )
                                             .append( mastercap.$toolToggle);
     mastercap.$voxsz.find("input").on("change",function(e)
     {
     	var v = parseFloat($(e.target).val());
     	state.viewer.worldVoxelsize = [v,v,v];
     	 worldMaster();
     	 worldMaster();
     	 
    	signalhandler.send("reslice positionChange");
     });
	 mastercap.$div = $("<div class='annotation_tool_elemDIV'></div>").appendTo($listDIV);
     mastercap.$captionBar.appendTo(mastercap.$div)  ;

     return mastercap;
  }();


  function worldMaster()
  {
    var navtool = that;
    if (getGlobalBBox() == undefined)
	{
		alertify.error('load some images before ...')
		return;
	}
		
	  
	  
	KViewer.viewports['world'] = function()
	{ 
	  var that = {};
	  that.getCurrentViewer = function() { return that };
	  that.viewPortID = 'world';
	  that.medViewer = {dummyViewer:true};
	  that.medViewer.currentFilename = "world";
	  that.medViewer.toolbar = {$mainViewportSelector: mastercap.$worldToggle };
	  that.viewPortID = 'world';

       
	  if (typeof(state.viewer.worldVoxelsize[0]) == "string")
	  { 
	    try{  state.viewer.worldVoxelsize = JSON.parse(state.viewer.worldVoxelsize); }
	    catch {
	    try{ state.viewer.worldVoxelsize = JSON.parse("["+state.viewer.worldVoxelsize+"]"); }
	    catch {}
	    }
	  }

   	  mastercap.$voxsz.find("input").val(state.viewer.worldVoxelsize[0]);
    
      var bbox = getGlobalBBox()
      var bbox_min = bbox.bbox_min;
      var bbox_max = bbox.bbox_max;

	  var voxsz = eval(state.viewer.worldVoxelsize);
	  if (voxsz == undefined || voxsz.length < 3) 
	  	 voxsz = [1,1,1];
	  voxsz[3] = 1;
 	  var sizes = [];
 	  for (var i=0; i< 3;i++)
 	  	 sizes[i] = math.floor((bbox_max[i]-bbox_min[i])/voxsz[i]);

	  var voxsz = [0,0,0,1];
 	  for (var i=0; i< 3;i++)
 	  	 voxsz[i] = (bbox_max[i]-bbox_min[i])/sizes[i];


      var Order = KMedViewer.getPermutationOrder();
      var perm = Order.perm;
  
	  var edges = math.matrix(math.diag(voxsz));
 	  

      for (var i = 0;i < 3;i++)
		   edges._data[i][3] = +bbox_min[i];
	  	

	  that.medViewer.nii = {
		  edges: edges,
		  voxSize: voxsz,
		  pixdim: [1,voxsz[0],voxsz[1],voxsz[2]],
		  sizes: sizes,//  newsizes,
		  permutationOrder:perm,
		  arrayReadDirection: Order.flips, 
		  detsign:math.sign(math.det(edges))
	   }
	  that.medViewer.niiOriginal = that.medViewer.nii;
       return that;    
    }();    
    
    KViewer.toggleMainViewport('world');


//    signalhandler.send("reslice positionChange");
    signalhandler.send("positionChange");
  }
  that.worldMaster = worldMaster;


 /*****************************************************************************************
  *  Show the transform
  ****************************************************************************************/
  that.$applybutton = undefined;
  that.transform = function ()
  {

  	 var transform = {};	  
     transform.$captionBar = $("<div></div>").append( $("<div class='annotation_tool_caption' style='flex-grow:1;font-weight:bold'> affine transform</span>") );
	 transform.$div = $("<div class='inactive annotation_tool_elemDIV'></div>").appendTo($listDIV);
     transform.$captionBar.appendTo(transform.$div)  ;


     var $table  = $("<table></table>").appendTo(transform.$div);
   
	 

	 var $tools = ( $("<div class='annotation_tool_elemDIV_tools'></div>") )
				.append( that.$applybutton = $("<i class='fa fa-fw'> <span> APPLY </span> </i>").click(applyTransform) )
				.append( $("<i class='fa fa-reply'> </i>").click(resetTransform) )
				.append( $("<i class ='fa fa-save '></i>").click(saveTransform  ))
	 transform.$captionBar.append($tools);

    
     var inputs = [];
     for (var j = 0; j < 3; j++)
     {
		inputs[j] = [];
		var $row  = $("<tr></tr>");
		for(var k=0;k<4;k++)
		{
		   var $td = $("<td>").appendTo($row).on('change', onInputFieldChange);
		   inputs[j][k] = $("<input type = 'number' value='"+ ((j==k)?1:0) +"' />").appendTo($td);
		}
		$row.appendTo( $table );
 	 }


     transform.$deformBar = $("<div></div>").append( $("<div class='annotation_tool_caption' style='flex-grow:1;font-weight:bold'> deformable transform</span>") );



     transform.$deformBar.appendTo(transform.$div)  ;
     transform.cnt = 0;
     transform.toggleShowHide = true

     transform.$showall =  $("<i class='fa fa-eye fa-1x'> show </i>").
     appendTooltip("show/hide all correspondences").click(
     function()
     {

         if (that.transform.type_marker == "1")
         {
		  	    var msets = markerProxy.getMarkersetsByName()		
				if (msets['source'] != undefined)
					msets['source'].showPanel()
				if (msets['target'] != undefined)
					msets['target'].showPanel()
         }
         else
         {

			 if (transform.toggleShowHide)
			 {
				 markerProxy.showAll()
				 transform.$showall.text("hide")
			 }
			 else
			 {
				 markerProxy.hideAll()
				 transform.$showall.text("show")
			 }
			 transform.toggleShowHide = !transform.toggleShowHide
         }
     }
     )
     function addmatch(type)
     {
            var mset = KViewer.markerTool.createMarkerSet('correspondence','correspondence ' + (++transform.cnt)  )
	        var bbox = getGlobalBBox()
	    	var s = Math.abs(bbox.bbox_min[0]-bbox.bbox_max[0])/33;
	    	if (type == 'shift')
	    	{
				mset.addpoint(undefined,undefined,undefined, {size:s,color:2,name:'source'})
				mset.addpoint(undefined,undefined,undefined, {size:5*s,name:'target'})
	    	}
	    	if (type == 'scale')
	    	{
				mset.addpoint(undefined,undefined,undefined, {size:s*5,color:2,name:'scaleblob'})
	    	}
			var numcorr = markerProxy.getSetByType("correspondence").length
            transform.$correspondence_info.text("correspondences: " +numcorr)
			//if (KViewer.mainViewport == -1)
			//	worldMaster();
            
  		    that.createDefField();
			transform.$toggle.addClass('KViewPort_tool_enabled');



     }
     transform.$addmatch1 =  $("<i class='fa fa-plus fa-1x'> <span>add</span> </i>").click(function() { addmatch('shift');})
     //transform.$addmatch2 =  $("<i class='fa fa-plus fa-1x'> <span>scale</span> </i>").click(function() { addmatch('scale');})

     transform.clearallCorrespondence = function()
     {
		for (var k in markerProxy.markersets)
		{
			if (markerProxy.markersets[k].type == 'correspondence')
			   markerProxy.delSet(k)
			else if (markerProxy.markersets[k].type == 'pointset' & 
			    (markerProxy.markersets[k].name == 'source' | markerProxy.markersets[k].name == 'target') )
			{
				markerProxy.markersets[k].deleteAllPoints()
			}
		}
		transform.$correspondence_info.text("correspondences: 0")
        if (transform.$toggle.hasClass('KViewPort_tool_enabled'))
		    that.createDefField();
     }
     transform.$clearall =  $("<i class='fa fa-trash fa-1x'> <span>clear</span> </i>")
                              .click(transform.clearallCorrespondence);


     transform.toggle = function(val)
     {
     	 if (val == true | (KViewer.reorientationMatrix.deffield == undefined & val != false))
     	 {
     	 	    if (KViewer.mainViewport == -1)
     	 	        worldMaster();
    			transform.$toggle.addClass('KViewPort_tool_enabled');
     	 	    that.createDefField();
     	 }
     	 else
     	 {
    			transform.$toggle.removeClass('KViewPort_tool_enabled');
     	 	    KViewer.reorientationMatrix.deffield = undefined;
			    transform.$apply.hide()			
			 
     	 	    signalhandler.send('positionChange')

     	 }

     }
     transform.$apply =  $("<i class='fa fa-fw'> <span>APPLY</span> </i>")
         .click(applyTransform).appendTo(transform.$deformBar).hide();
     transform.$toggle =  $("<i class='fa fa-fw'> <span>enable</span> </i>")
         .click(function() { transform.toggle() } ).appendTo(transform.$deformBar);


     transform.type_marker = "0"


     transform.dump = function()
     {
		 
        function done()
        {
			that.deffield_extern.modified = true
		    transform.$apply.show()			
			KViewer.cacheManager.update()
			transform.clearallCorrespondence()
        }

        if (that.deffield_extern == undefined)
        {
            var def = KViewer.reorientationMatrix.deffield;
            var nii = createNifti(def,"deformation","float",3,{descrip:"Deformation"})
			var fobj = KViewer.dataManager.getFile("deformation")
			fobj.modified = true;	
			fobj.fileinfo = {SubFolder: "transforms", tag:""}

			fobj.content.data.set(def.data);
        	that.deffield_extern = fobj;
        	done()
        }
        else
        {
			var def = that.deffield_extern.content;
    		$(document.body).addClass("wait");	
			
            that.genCorrespondenceWarp(def.sizes,def.voxSize,def.edges,
                                def.arrayReadDirection,def.permutationOrder,
                                          that.deffield_extern.content,
                          function(warp)
                          {
                                that.deffield_extern.content.data.set(warp.data)       
                        		$(document.body).removeClass("wait");	
	                            done()                   	
                          },true)

        }
  	
     }

     var $table  = $("<table class='deformable'></table>").appendTo(transform.$div);
     transform.$info = $("<span> warp: id </span>")
     transform.$genwarp = $("<i class ='fa'>dump</i>").click(transform.dump);
     transform.$genwarp.appendTooltip('dump correspondences as warp')


     transform.types = ['set of displacements','pair of sets']
     transform.type_marker = 0;
     transform.$typSelector = $('<select>sym:</select>').on('change', function()
        { 
          var sel = $(this).val()
          if (sel == "1")
          {
          	
		  	    var msets = markerProxy.getMarkersetsByName()
				function create(name)
				{
					var opts = {name:name, 
						type:"pointset",
						showPanel: true,
						hideOtherPanels: false}
						var mset = markerProxy.newSet( opts );
				}

				if (msets['source'] == undefined)
					create("source")
				else 
					msets['source'].showPanel()

				if (msets['target'] == undefined)
					 create("target")
				else 
					msets['target'].showPanel()

				that.update();

				transform.type_marker = sel;
				if (KViewer.reorientationMatrix.deffield != undefined)
				    that.createDefField()
  			    return;
          }

          transform.type_marker = $(this).val();
		  that.createDefField()

		  
        }  );
     transform.types.forEach( function(e,i)  {  $('<option >'+e+'</option>').val( i ).appendTo(transform.$typSelector)  } );


     transform.symmetries = ['none','x.axis','y.axis','z.axis']
     transform.currentSym = 0;
     transform.$symSelector = $('<select>sym:</select>').on('change', function()
        { transform.currentSym = $(this).val();
		  that.createDefField()
        }  );
      transform.symmetries.forEach( function(e,i)  {  $('<option >'+e+'</option>').val( i ).appendTo(transform.$symSelector)  } );


     transform.$clearwarp = $("<i class ='fa fa-reply '></i>").click(function()
     {
		that.deffield_extern = undefined;
		transform.$info.text("warp:id")
	    transform.$apply.hide()			
		 
 	    that.createDefField();


     })
     transform.$savewarp = $("<i class ='fa fa-save '></i>").click(function()
     {
	   transform.dump();
	   var suggest;
	   if (transform.last_name != undefined)
		   suggest = transform.last_name;
	   else
	   {
		   suggest = that.deffield_extern.filename;
		   if (that.deffield_extern.fileinfo.SubFolder != "")
				suggest = that.deffield_extern.fileinfo.SubFolder +"/"+suggest;
	   }

	   saveDialog("deformation field",function(name,finfo){

				transform.last_name = name;
				var s = name.split("/");
				var subfolder = s.slice(0,s.length-1).join("/")
				var filename = s[s.length-1]
				that.deffield_extern.filename = filename
				that.deffield_extern.fileinfo = finfo;		   
				that.deffield_extern.fileinfo.Filename = filename;
				that.deffield_extern.fileinfo.SubFolder = subfolder;
				tempObjectInfo = [];
				tempObjectInfo.push({fileID:that.deffield_extern.fileID});      
				KViewer.cacheManager.update();
				KViewer.cacheManager.uploadFiles(that.progressSpinner,true);     
         	    that.createDefField();					

		   
	   },suggest)

     })
     $table.append( $("<tr></tr>")
            .append( 
            $("<th colspan=3></th>")
            .append(transform.$info)
            .append(transform.$savewarp)
            .append(transform.$clearwarp)

            )
          );


	 var numcorr = 0; // markerProxy.getSetByType().length
     transform.$correspondence_info = $("<span> correspondences: "+numcorr+" </span>")
     $table.append( $("<tr></tr>")
            .append( 
            $("<th colspan=3></th>")
            .append(transform.$correspondence_info)
            .append(transform.$clearall)
            .append(transform.$addmatch1)
            .append(transform.$addmatch2)
            .append(transform.$showall)
            .append(transform.$genwarp)            
            )
          );

     $table.append($('<span style="float:right;color:black">symmetry:</span>').append(transform.$symSelector))
     $table.append($('<span style="float:right;color:black">type:</span>').append(transform.$typSelector))

     function update()
	 {
		 var mat = KViewer.reorientationMatrix.matrix;
		 if (mat != undefined)
		 {
			mat = mat._data;
	 	    for (var j = 0; j < 3; j++)
			  for(var k=0;k<4;k++)
				inputs[j][k][0].value = mat[j][k].toFixed(3);
     	 }
  	 }
	 signalhandler.attach("positionChange",update);
	 transform.update = update;

	 function onInputFieldChange(event)
	 {	   	  
	    var mat = KViewer.reorientationMatrix.matrix;
		for (var j = 0; j < 3; j++)
 		    for(var k=0;k<4;k++)
 		    	 mat._data[j][k] = parseFloat( inputs[j][k][0].value);


//	    coords = math.multiply(mat, KViewer.currentPoint ); // apply RAS or other
//	    master.currentPoint = math.matrix( coords );
	    signalhandler.send("positionChange");
	 }

	 return transform;
    }();


 /*****************************************************************************************
  *  Apply the transform by drop of files
  ****************************************************************************************/


  function Waiter(callback)
  {
	 var funs = [];
	 var waiter = {};
	 waiter.callback = callback;
	 waiter.waitfor = function(f)
	 {
	 	funs.push(f);
	 }
	 waiter.done = function(f)
	 {
	 	for (var k= 0; k < funs.length;k++)
	 	{
	 		if (funs[k]==f)
	 		{
	 			funs.splice(k,1);
	 			break;
	 		}
	 	}
	 	if (funs.length == 0)
	 		waiter.callback();
	 	
	 }
	 return waiter;

  }


  that.movingObjs = {};

  that.updateMoving = function()
  {
	 dropapply.$dragarea.children().remove();
	 objs = Object.keys(that.movingObjs);
	 for (var k = 0; k < objs.length; k++)
	 {
	 	var fobj = that.movingObjs[objs[k]];
	 	if (fobj != undefined)
	 	{
			var dragstuff = "draggable='true' data-type='file' data-piz='' data-sid='' data-tag='"+fobj.fileinfo.Tag+"' data-filename='"+fobj.filename+"' data-subfolder='' data-fileID='"+fobj.fileID+"' data-mime='"+fobj.contentType+"'";
			dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";	 	
			var $close = $("<i class='fa fa-fw fa-close'></i>").click(function(o) { return function() { delete that.movingObjs[o];  that.updateMoving();   } }(objs[k]) );
			$("<div> <div "+dragstuff+">" + fobj.filename + "</div>  </div>").append($close).appendTo(dropapply.$dragarea);
	 	}	 
		else
			delete that.movingObjs[objs[k]]
			
	 }
 	 if (objs.length > 0)
	 {
	   var oldMode = KViewer.navigationMode;
	   if (KViewer.navigationMode != 0)
	      that.switchToNavimode(0);
	   if (oldMode == 2)
	   {
		   var p = KViewer.getWorldPosition()
		   if (p != undefined && master.reorientationMatrix.notID)
		   {
				 p = math.multiply((master.reorientationMatrix.matrix), p);
				 KViewer.setWorldPosition(p)
		   }
	   }
	 }
	 else
	 {
	     $("<span>drop nifti to define moving images </span>").appendTo(dropapply.$dragarea);
	     var p = KViewer.getWorldPosition()
	     if (p != undefined && master.reorientationMatrix.notID)
	     {
		     p = math.multiply(math.inv(master.reorientationMatrix.matrix), p);
             KViewer.setWorldPosition(p)
	     }
	     that.switchToNavimode(2);
	 }

	 signalhandler.send("positionChange");
  }

 
  function ondrop(e) {
	e.preventDefault();
	e.stopPropagation();
	var params = getloadParamsFromDrop(e,{});
	for (var k = 0;k < params.length;k++)
	{
		if (!params.patient_study_drop)
		{
			params[k].callback = function(fobj) {
				if (fobj.contentType == 'nii')
				{
					if (((fobj.content.sizes[3] == 1 && fobj.content.sizes[4] == 3) || fobj.content.sizes[3] == 3)
						 &&  (typeof fobj.content.descrip == "string" && fobj.content.descrip.search("eformation")>-1))
					{
						that.setExternDeformationField(fobj)
					}
					else
					{
						that.movingObjs[fobj.fileID] = fobj;
						that.updateMoving();
					}
				}
				else if(fobj.contentType == 'json')
				   if ( (fobj.fileinfo.Tag != undefined && fobj.fileinfo.Tag.search("RO") >= 0) | 
				         fobj.filename.search("\.transform\.json") > 0)
				     {
						master.setReorientationMatrix(fobj);
						alertify.success('affine reorientation loaded')
				     }


				this.progressSpinner();
			}
			params[k].progressSpinner = that.progressSpinner;
			KViewer.dataManager.loadData(params[k]);		

		}
	}
  }

  var dropapply = function ()
  {
		var dropapply = {};	  
		dropapply.$master = $("<div class='annotation_tool_elemDIV' ></div>").appendTo($listDIV);
		dropapply.$dragarea = $("<div dragover='return false'; class='annotation_tool_droparea'><span>drop nifti to define moving images</span></div>").appendTo(dropapply.$master);
		dropapply.$master.on("dragover", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
		dropapply.$master.on("dragleave", function(ev){ev.preventDefault();ev.stopPropagation();return false;});
    	return  dropapply;
  }();




  function packNiiForTransfer(nii)
		{
			if (nii == undefined)
				return undefined
			else
				return {data:nii.data,
				edges:nii.edges,descrip:nii.descrip,sizes:nii.sizes,voxSize:nii.voxSize,widheidep:nii.widheidep,wid:nii.wid,widhei:nii.widhei};
		}
  function warpImageWorker(def,Adef,nii,interpType,callback)
  {
		$(document.body).addClass("wait");	
		var worker = executeImageWorker({func:'warpimg',
			def:packNiiForTransfer(def),
			Adef:Adef,
			nii:packNiiForTransfer(nii),
			interpType:interpType},
			[],
			function(e) { that.progressSpinner(e);},
			function(e)
			{
				that.progressSpinner();
				$(document.body).removeClass("wait");		
				nii.data.set(e.execObj);
				callback();
			},worker);
  }

  function renderWarpWorker(matches,edges,sizes,def_ext,callback)
  {
		var worker = executeImageWorker({func:'renderwarp',
			def_ext:packNiiForTransfer(def_ext),
			matches:matches,
			edges:edges,
			sizes:sizes},
			[],
			function(e) { that.progressSpinner(e);},
			function(e)
			{
				callback(e.execObj);
			},worker);
	}


	function applyTransform()
	{
//	    alertify.prompt("Please enter a name of the transform (note that you also change the " +
//	    "affine matrix of all niftis selected for coregistration)",function (e,name) {
//		if (e)
//		{
	        var name = "reorient"
   		    var fnames = [];
   		    var keys = Object.keys(that.movingObjs);
			for (var k = 0; k < keys.length; k++)
			{
			    if (that.movingObjs[keys[k]] != undefined)
			       fnames.push(that.movingObjs[keys[k]].filename);
			    else
			       delete that.movingObjs[keys[k]]
			}
			
			var finfo = that.movingObjs[keys[0]].fileinfo;

			
			if (!isIdentity(KViewer.reorientationMatrix.matrix ))
			{
				KViewer.reorientationMatrix.name = name;
				uploadJSON(name,
				  {matrix: KViewer.reorientationMatrix.matrix._data, applied_when:Date(), applied_on:fnames  },
				  {subfolder: "transforms", tag:"RO", patients_id:finfo.patients_id, studies_id:finfo.studies_id},
				  applyOnNiftis );
			}
			else
			    applyOnNiftis();
			
//		} },'reorient' );



        function warpImage(def,Adef,nii,interpType,callback)
        {

			var A = math.inv(nii.edges)._data

			if (interpType == "roi")
				getVal = function(nii,p,A,j)
				{
				   return trilinInterp(nii,p[0],p[1],p[2],A,nii.widheidep*j)>0.5;
				}
			else if (interpType == "atlas")
				getVal = function(nii,p,A,j)
				{
				   return NNInterp(nii,p[0],p[1],p[2],A,nii.widheidep*j);
				}
			else
				getVal = function(nii,p,A,j)
				{
				   return trilinInterp(nii,p[0],p[1],p[2],A,nii.widheidep*j);
				}

			var data = nii.data
			nii.data = data.slice();
			var sz = nii.sizes;
			for (var z=0;z<sz[2];z++)
			for (var y=0;y<sz[1];y++)
			for (var x=0;x<sz[0];x++)
			{
				var p = [trilinInterp(def,x,y,z,Adef,def.widheidep*0),
						trilinInterp(def,x,y,z,Adef,def.widheidep*1),
						trilinInterp(def,x,y,z,Adef,def.widheidep*2)]
				var idx = x+nii.wid*y+nii.widhei*z;
				for (var j=0;j<sz[3];j++)
				   data[idx + j*nii.widheidep] = getVal(nii,p,A,j)
			}
			nii.data = data;

			callback();

        }


		function applyOnNiftis()
		{
			tempObjectInfo = [];
			var keys = Object.keys(that.movingObjs);
			var getVal = undefined
			iterate(0);
			function iterate(k)
			{
				if (k >= keys.length)
				{
					signalhandler.send('positionChange');
					resetTransform();
                    if (!(electron | userinfo.username == guestuser))
                    {
                    	KViewer.cacheManager.uploadFiles.ignoreZipSetting = true
					    KViewer.cacheManager.uploadFiles(that.progressSpinner,true);				 
					    
                    }
				    return
				}
				var fobj = that.movingObjs[keys[k]];

                var interpType;
				if (KViewer.roiTool.ROIs[fobj.fileID] != undefined)
				    interpType = "roi"
				else if (KViewer.atlasTool.objs[fobj.fileID] != undefined)
                    interpType = "atlas"
				else
				    interpType = "linear"

                if (KViewer.reorientationMatrix.deffield && that.transform.$toggle.hasClass('KViewPort_tool_enabled'))
                {
					var def_edges_inv = math.inv(KViewer.reorientationMatrix.deffield.edges);      
					var Adef = math.multiply(def_edges_inv, fobj.content.edges)._data;
        			that.progressSpinner("warping " + fobj.filename);
                    warpImageWorker(KViewer.reorientationMatrix.deffield,Adef, fobj.content,interpType,changeEdgesAndUpload)

                    //warpImage(KViewer.reorientationMatrix.deffield,Adef, fobj.content,interpType,changeEdgesAndUpload)
                }
                else
                    changeEdgesAndUpload()
                    
                function changeEdgesAndUpload()
                {

					var view = new DataView(fobj.content.buffer)

                    var newedges,coregmat;
                    if (fobj.content.coreginfo)
                    {
                    	coregmat = fobj.content.coreginfo.matrix;
                    	newedges = math.multiply(math.matrix(math.inv(coregmat)),math.multiply(math.inv(KViewer.reorientationMatrix.matrix),fobj.content.edges))
				    }                        
				    else
  		 		        newedges = math.multiply(math.inv(KViewer.reorientationMatrix.matrix),fobj.content.edges);


					for(var i=0; i<3; i++) 
					  for (var j=0; j<4; j++)
						view.setFloat32(280+4*(4*i+j), newedges._data[i][j], fobj.content.endian=='little');

					var qquat = sform2quaternion(newedges);



					view.setFloat32(256, qquat.q[0], fobj.content.endian=='little');
					view.setFloat32(260, qquat.q[1], fobj.content.endian=='little');
					view.setFloat32(264, qquat.q[2], fobj.content.endian=='little');
					view.setFloat32(268, newedges._data[0][3], fobj.content.endian=='little')
					view.setFloat32(272, newedges._data[1][3], fobj.content.endian=='little')
					view.setFloat32(276, newedges._data[2][3], fobj.content.endian=='little')


					view.setFloat32(76+4*1, qquat.pixdim[1] , fobj.content.endian=='little')
					view.setFloat32(76+4*2, qquat.pixdim[2] , fobj.content.endian=='little')
					view.setFloat32(76+4*3, qquat.pixdim[3] , fobj.content.endian=='little')

					view.setInt16(252, 0, fobj.content.endian=='little')
					view.setInt16(254, 1, fobj.content.endian=='little')

					var tmp = prepareMedicalImageData(parse(fobj.content.buffer), {});
                
                    if (coregmat != undefined)
                    	 fobj.content.edges = math.multiply(math.matrix(coregmat),tmp.edges);
                    else
					    fobj.content.edges = tmp.edges;

					fobj.content.arrayReadDirection = tmp.arrayReadDirection;
					fobj.content.permutationOrder = tmp.permutationOrder; 
					fobj.modified = true;
					tempObjectInfo.push({fileID:that.movingObjs[keys[k]].fileID});      
					KViewer.cacheManager.update();


					iterate(k+1)
                }

			}

		}


	}


    that.setExternDeformationField = function(fobj)
    {
        that.transform.$info.text(" warp:"+ fobj.filename)
        that.deffield_extern = fobj;
        that.createDefField();
		that.transform.$toggle.addClass('KViewPort_tool_enabled');
 	    if (KViewer.mainViewport == -1)
     	 	        worldMaster();		
		

    }

    that.createDefField = function()
    {

      var bbox = getGlobalBBox()
      if (bbox == undefined)
          return;
      var bbox_min = bbox.bbox_min;
      var bbox_max = bbox.bbox_max;


     // var sizes = [32,32,32];
      var sizes = [64,64,64];

	  var voxsz = [0,0,0,1];
 	  for (var i=0; i< 3;i++)
 	  	 voxsz[i] = (bbox_max[i]-bbox_min[i])/(sizes[i]-1);


      var Order = KMedViewer.getPermutationOrder();
      var perm = Order.perm;
  
	  var edges = math.matrix(math.diag(voxsz));
 	  
      for (var i = 0;i < 3;i++)
		   edges._data[i][3] = +bbox_min[i];
	  
	  
	  var basisDef = undefined;
	  if (that.deffield_extern)
	  {
	      basisDef = that.deffield_extern.content;
          that.transform.$info.text("warp:" + that.deffield_extern.filename)

	  }

      
	  that.genCorrespondenceWarp(sizes,voxsz,edges,Order.flips,perm,basisDef,
					 function(warp)
					 {
                          KViewer.reorientationMatrix.deffield = warp;
						  if (that.createDefField.cid != undefined)
							   clearTimeout(that.createDefField.cid)
						  that.createDefField.cid = setTimeout(function(){       	   
							   signalhandler.send("positionChange clearMultiOutlines")
						   },100);
					 },false);


    }

    that.genCorrespondenceWarp = function(sizes,voxsz,edges,arrayReadDirection,perm,
                                          def_ext,callback,useworker)
    {

      var invedges = math.inv(edges);
      var matches = []
  	  function addmatch(p0,p1,r)
  	  {
		var dif = [p0[0]-p1[0],p0[1]-p1[1],p0[2]-p1[2]]
		var del = Math.sqrt(dif[0]*dif[0]+dif[1]*dif[1]+dif[2]*dif[2])
		var x = math.multiply(invedges,p1)._data;
		var z = (del+r)/voxsz[0];
	  	matches.push({dif:dif,r:x,s:1/(z*z)})
      }

	  function attachCallback(ps)
	  {
		 for (var j = 0;j < ps.length;j++)
			 ps[j].onupdate.warper = function() {
				if (KViewer.reorientationMatrix.deffield != undefined)
					that.createDefField()
			 };			 	
	  }

	  function attachCallbackSet(a)
	  {
			 a.onupdate.warper = function() {
				if (KViewer.reorientationMatrix.deffield != undefined)
					that.createDefField()
			 }			 	
	  }



      if (that.transform.type_marker == '1') // pair of sets
      {
      	  var a,b;
		  for (var k in markerProxy.markersets)
		  {
                if (markerProxy.markersets[k].name == "source")
                   a = markerProxy.markersets[k];
                if (markerProxy.markersets[k].name == "target")
                   b = markerProxy.markersets[k];
		  }
		  var R1 = a.getPointsByName()
		  var R2 = b.getPointsByName();

          attachCallbackSet(a)
          attachCallbackSet(b)
          attachCallback(a.getPoints())   
		  attachCallback(b.getPoints())
		  for (var k in R1)
		  {
		  	 if (R2[k] == undefined)
		  	 	continue;
		  	 var p1 = R1[k].p.coords
		  	 var p2 = R2[k].p.coords
		  	 var r = R1[k].p.size + R2[k].p.size
		  	 addmatch([p1[0],p1[1],p1[2],1],[p2[0],p2[1],p2[2],1],r)

		 	 if (that.transform.currentSym > 0)
			 {
				var s = [1,1,1]
				s[that.transform.currentSym-1] = -1;
				var p0 = [s[0]*p1[0],s[1]*p1[1],s[2]*p1[2],1 ]
				var p1 = [s[0]*p2[0],s[1]*p2[1],s[2]*p2[2],1 ]
				addmatch(p0,p1,r);
			 }


		  }



      }
      else
      {
		  for (var k in markerProxy.markersets)
		  {
			 var s = markerProxy.markersets[k]
			 if (s.type == 'correspondence')
			 {

				 var ps = s.getPoints();
				 var p = s.getPointsAsArray();

				 if (ps.length == 2 && ps[0].p.name == 'source')
				 {

					addmatch(p[0],p[1],ps[1].p.size)
					if (that.transform.currentSym > 0)
					{
						var s = [1,1,1]
						s[that.transform.currentSym-1] = -1;
						var p0 = [s[0]*p[0][0],s[1]*p[0][1],s[2]*p[0][2],p[0][3] ]
						var p1 = [s[0]*p[1][0],s[1]*p[1][1],s[2]*p[1][2],p[1][3] ]
						addmatch(p0,p1,ps[1].p.size);
					}


					attachCallback(ps);
				 }
				 else if (ps.length == 1 && ps[0].p.name == 'scaleblob')
				 {
					 var x = math.multiply(invedges,p[0])._data;
					 var scale = ps[0].p.size/voxsz[0];	

					 matches.push({r:x,s:1/(scale*scale)})
					 attachCallback(ps);
				 }
				 else
				 {
					 for (var j = 0;j < ps.length;j++)
					 {
						 delete ps[j].onupdate.warper;
					 }
				 }    
			 }
		  }
      }


	  if (matches.length>0)
	      that.transform.$correspondence_info.text("correspondences:"+matches.length)

      if (useworker)
          renderWarpWorker(matches,edges,sizes,def_ext,done);
      else
      {      
          var data = renderWarp(matches,edges,sizes,def_ext)
          done(data)
      }

      function done(data)
      {
		  callback({
			  edges: edges,
			  voxSize: voxsz,
			  pixdim: [1,voxsz[0],voxsz[1],voxsz[2]],
			  sizes: sizes,//  newsizes,
			  wid:sizes[0],
			  widhei:sizes[0]*sizes[1],
			  widheidep:sizes[0]*sizes[1]*sizes[2],
			  data: data,
			  permutationOrder:perm,
			  arrayReadDirection: arrayReadDirection,
			  filetype: "nifti",
			  detsign:math.sign(math.det(edges))
		   })
      }   
    }


    function renderWarp(matches,edges,sizes,def_ext)
    {
		  var sigma = 0.5;
		  var sigma2 = 1/(sigma*sigma);

		  var matrix = [];
		  var target = [];
		  for (var j = 0; j < matches.length;j++)
		  {
			  var x = matches[j].r[0]
			  var y = matches[j].r[1]
			  var z = matches[j].r[2]
			  var row = [];
			  target.push(matches[j].dif)
			  for (var k = 0; k < matches.length;k++)
			  {
				  var s = [(x-matches[k].r[0]),(y-matches[k].r[1]),(z-matches[k].r[2])]
				  var d2 = s[0]*s[0]+s[1]*s[1]+s[2]*s[2];
				  row.push(Math.exp(-d2*sigma2*matches[k].s))
			  }
			  matrix.push(row)
		  }

		  if (target.length > 0)
		  {
			  target = math.Transpose(math.matrix(target))
			  matrix = math.matrix(matrix)
			  var dif = []
			  for(var i=0;i < 3;i++)
			  {
				  dif.push(math.mdiv(matrix,math.matrix(target._data[i]))._data)
			  }
			  dif = math.Transpose(math.matrix(dif))._data
		  }


		  var e = edges._data
		  var tot = sizes[0]*sizes[1]*sizes[2];
		  var data = new Float32Array(tot*3)

		  if (def_ext)
		  {
			  var tred = math.multiply(math.inv(def_ext.edges),edges)._data;
			  var defdef = def_ext;
			  var defdef_whd = def_ext.widheidep
		  }


      
		  var f = [];
		  var d = [];
		  for (var x=0;x < sizes[0];x++)
		  for (var y=0;y < sizes[1];y++)
		  for (var z=0;z < sizes[2];z++)
		  {
			  var idx = x+sizes[0]*y+sizes[0]*sizes[1]*z

			  for (var k = 0; k < matches.length;k++)
			  {
				  var s = [(x-matches[k].r[0]),(y-matches[k].r[1]),(z-matches[k].r[2])]
				  var d2 = s[0]*s[0]+s[1]*s[1]+s[2]*s[2];
				  d[k] = s;
				  f[k] = Math.exp(-d2*sigma2*matches[k].s)
			  }
			  for (var i = 0; i < 3; i++)
			  {
				 if (def_ext)
					 data[idx+i*tot] = trilinInterp(defdef,x,y,z,tred,defdef_whd*i);
				 else
					 data[idx+i*tot] = e[i][0]*x + e[i][1]*y + e[i][2]*z + e[i][3] 	
				 for (var k = 0;k < matches.length;k++)
				 {
					if (matches[k].dif)
						data[idx+i*tot] += f[k]*dif[k][i];
					else
						data[idx+i*tot] -= 1*f[k]*d[k][i]*voxsz[0];
				 }
			  }

		  }

		  return data;
    }

    that.switchToNavimode(master.navigationMode);

  
	return that;
}

