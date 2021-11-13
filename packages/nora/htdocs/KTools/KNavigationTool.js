
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

  /***************************************************************************************
   *  The navigation modes 
   ****************************************************************************************/

  function naviMenu()
  {
       var modes = {solid:2,coreg:0,resl:1}; var keys = invertObject(modes);
	   var $menu = $("<ul>");
       $menu.append($("<li onchoice='"+keys[2]+"'><a>Rotation </a> <i class='"+keys[2]+" fa fa-check-square-o'></i></li>"));
       $menu.append($("<li onchoice='"+keys[0]+"'><a>Coregister </a> <i class='"+keys[0]+" fa fa-check-square-o'></i></li>"));
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
	  KViewer.reorientationMatrix.matrix =  math.matrix(math.diag([1,1,1,1]));
  	  signalhandler.send("reslice");
	  KViewer.resetCrossHair();	
  }

  function saveTransform()
	{
		  alertify.prompt("Please enter a name",function (e,name) {
			if (e)
			{
				KViewer.reorientationMatrix.name = name;
				var mat =math.inv(KViewer.reorientationMatrix.matrix)._data
				uploadJSON(name,{matrix: KViewer.reorientationMatrix.matrix._data},{subfolder: "transforms", tag:"RO"},function (fobj,saveobj)
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
         		       },that.progressSpinner);				
				   }


				})

 		
			}
		  } );
	}


  /***************************************************************************************
   *  The transform menu
   ****************************************************************************************/


  function reorientationMenu()
  {

	   var $menu = $("<ul>");
       $menu.append($("<li onchoice='flipx'><a>Flip X </a></li>"));
       $menu.append($("<li onchoice='flipy'><a>Flip Y</a></li>"));
       $menu.append($("<li onchoice='flipz'><a>Flip Z</a></li>"));
       $menu.append($("<li onchoice='cycle'><a>Cycle permute</a></li>"));
       $menu.append($("<li onchoice='pari'><a>Change Parity</a></li>"));
       $menu.append($("<li onchoice='invert'><a>Invert</a></li>"));


       $menu.append($("<li onchoice='reset'><a>Reset Transformation</a></li>"));
       $menu.append($("<li onchoice='save'><a>Save Transformation</a></li>"));

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
  						  var mnii = KViewer.viewports[KViewer.mainViewport].medViewer.nii;
       					  var edges = math.multiply(1,mnii.edges);
						  edges = math.multiply(edges,permMat(mnii));

       					  var T = transMat(math.multiply(math.inv(edges),math.multiply(math.inv(KViewer.reorientationMatrix.matrix), KViewer.viewcenter)));			 
					      var E = math.multiply(edges,T);
						
						  if (str == 'invert')
						  {
							  KViewer.reorientationMatrix.matrix = math.inv(KViewer.reorientationMatrix.matrix);
						  }
						  else
						  {
							  var R;
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
  that.$topRow.append( $("<li class='menu_generic_disabled turnable'><a>Transformations</a></li>").append(reorientationMenu() ));
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
	KViewer.viewports['world'] = function()
	{ 
	  var that = {};
	  that.getCurrentViewer = function() { return that };
	  that.viewPortID = 'world';
	  that.medViewer = {dummyViewer:true};
	  that.medViewer.currentFilename = "world";
	  that.medViewer.toolbar = {$mainViewportSelector: mastercap.$worldToggle };
	  that.viewPortID = 'world';

      var bbox_max = [-Infinity,-Infinity,-Infinity];
      var bbox_min = [Infinity,Infinity,Infinity];
       
	  if (typeof(state.viewer.worldVoxelsize[0]) == "string")
	  	state.viewer.worldVoxelsize = JSON.parse(state.viewer.worldVoxelsize);

   	  mastercap.$voxsz.find("input").val(state.viewer.worldVoxelsize[0]);


      var files = KViewer.dataManager.getFileList();
      for (var k = 0;k<files.length;k++)
      {
      	 var obj = KViewer.dataManager.getFile(files[k]);
      	 navtool.movingObjs
		 if (obj.contentType == 'nii')
		 {
			var edges = obj.content.edges;


        //    if ( navtool.movingObjs && navtool.movingObjs[files[k]])
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
       return that;    
    }();    
    
    KViewer.toggleMainViewport('world');


    signalhandler.send("reslice positionChange");
  }
  that.worldMaster = worldMaster;


 /*****************************************************************************************
  *  Show the transform
  ****************************************************************************************/
  that.$applybutton = undefined;
  that.transform = function ()
  {

  	 var transform = {};	  
     transform.$captionBar = $("<div></div>").append( $("<div class='annotation_tool_caption' style='flex-grow:1;font-weight:bold'> current transform</span>") );
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
	 }
 	 if (objs.length > 0)
	 {
	   if (KViewer.navigationMode != 0)
	      that.switchToNavimode(0);
	   if (KViewer.mainViewport != 'world')
	   	  worldMaster();
	 }
	 else
	 {
	   $("<span>drop nifti to define moving images </span>").appendTo(dropapply.$dragarea);
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
							that.movingObjs[fobj.fileID] = fobj;
							that.updateMoving();
						}
			     		else if(fobj.contentType == 'json')
						   if (fobj.fileinfo.Tag.search("RO") >= 0)
				 				master.setReorientationMatrix(fobj);


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

	function applyTransform()
	{
	    alertify.prompt("Please enter a name of the transform (note that you also change the " +
	    "affine matrix of all niftis selected for coregistration)",function (e,name) {
		if (e)
		{
   		    var fnames = [];
   		    var keys = Object.keys(that.movingObjs);
			for (var k = 0; k < keys.length; k++)
			   fnames.push(that.movingObjs[keys[k]].filename);
			
			var finfo = that.movingObjs[keys[0]].fileinfo;

			
			KViewer.reorientationMatrix.name = name;
			uploadJSON(name,
			  {matrix: KViewer.reorientationMatrix.matrix._data, applied_when:Date(), applied_on:fnames  },
			  {subfolder: "transforms", tag:"RO", patients_id:finfo.patients_id, studies_id:finfo.studies_id},
			  applyOnNiftis );
			
		} },'reorient' );

		function applyOnNiftis()
		{
			tempObjectInfo = [];
			var keys = Object.keys(that.movingObjs);
			for (var k = 0; k < keys.length; k++)
			{
				var fobj = that.movingObjs[keys[k]];
				var newedges = math.multiply(math.inv(KViewer.reorientationMatrix.matrix),fobj.content.edges);

				var view = new DataView(fobj.content.buffer)
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
				fobj.content.edges = tmp.edges;
				fobj.content.arrayReadDirection = tmp.arrayReadDirection;
				fobj.content.permutationOrder = tmp.permutationOrder; 
				fobj.modified = true;
        	    tempObjectInfo.push({fileID:keys[k]});      
				KViewer.cacheManager.update();
			}
			signalhandler.send('reslice positionChange');
			resetTransform();
            KViewer.cacheManager.uploadFiles(that.progressSpinner,"usenativePID");

		}


	}


    that.switchToNavimode(master.navigationMode);

	return that;
}

