
// ======================================================================================
// ======================================================================================
// ============= KCacheManager
// ======================================================================================
// ======================================================================================


function KCacheManager(master)
{
   /** the tool to manage local files/uploads/downloads etc
   * @class 
   * @alias KCacheManager
   * @augments KToolWindow
   */
  var that = new KToolWindow(master,
  $("<div class='KView_tool '><i class='fa fa-institution fa-1x'></i></div>")
  .append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Workspace</li>")) ) );

  var dataman = master.dataManager;


  that.name = 'Workspace';


  var $menu = $("<ul ></ul>");

  if (electron)
  {


  

		var filters = [
			{ name: 'All Supported Formats', extensions: ['nii', 'mgh','mgz','nrrd','tck', 'trk','gii','gz', 'jpg', 'png' , 'json' , 'txt'  ] },
			{ name: 'NIFTI/MGH', extensions: ['nii','nii.gz', 'mgh','mgz','nrrd'] },
			{ name: 'Streamline Formats', extensions: ['tck','trk'  ] },
			{ name: 'Json', extensions: ['json' ] },
			{ name: 'Dicoms/Bruker', extensions: ['*'] },
			{ name: 'All Files', extensions: ['*'] }
		  ]

		function loadit(f)
		{		
				if (f.filePaths)
					f = f.filePaths;

				f = f.map(function(s) {return s.replace(/\\/g,"/");}); // for windows
				fileLoad(f); 
				updateRecent(f); 
		}


		function loadfiles()
		{
			var res = dialog.showOpenDialog(null,{ title: 'open files',
							properties: ['openFile','multiSelections'], filters:filters,
							defaultPath: defaultOpenPath
						})
			if (res)
			{						
				if (res.then)
					res.then(loadit);
				else 
					loadit(res);
			}
		}

		function loaddirs() 
		{		
			var res = dialog.showOpenDialog({ title: 'open directories',
							properties: ['openDirectory','multiSelections'],
							defaultPath: defaultOpenPath
						})
			if (res)
			{						
				if (res.then)
					res.then(loadit);
				else 
					loadit(res);
			}
  		}

  		 
  		var ipc = require('electron').ipcRenderer;
	    ipc.on('loadfiles', loadfiles)
	    ipc.on('loadrecent', function(event,args) {
			fileLoad([args]);
	    	})
	    ipc.on('loaddirs', loaddirs)
	    ipc.on('saveworkstate', saveWorkstate)

  		
		$("<li><a>Load Files</a></li>").click(loadfiles).appendTo($menu);
						
		$("<li><a>Load Directory</a></li>").click(loaddirs).appendTo($menu);

		$("<li><a>Save Workstate</a></li>").click(saveWorkstate).appendTo($menu);
						
		that.loadFile = fileLoad;

		function fileLoad(files,callback) {
				if (files !== undefined && files.length > 0) {
					var loadedFobj = []
					var fobj = [];
					for (var k = 0; k < files.length;k++)
						fobj.push( {
				 			 webkitGetAsEntry: KFileEntry(files[k])

						});

					defaultOpenPath = files[0].split("/").slice(0,-1).join("/");
					createLoadParamsFileDrop( {dataTransfer: { items:fobj,types:["Files"]  } },
								function (loadparams)
								{
									var aboutoabort = false;
									function serialize(k)
									{
										if (k>= loadparams.length || aboutoabort)
										{
											if (callback)
												callback(loadedFobj);
											return
										}
										else
										{
											if (loadparams[k].error)
											{
												loadedFobj.push(loadparams[k]);
												serialize(k+1);
											}
											else
											{
												var cb = loadparams[k].callback;
												loadparams[k].callback = function(fob)
												{
													if (cb)
														cb();
													if (fob != undefined)
													{
		 												logProcess('loaded ' + fob.filename);
													}
													loadedFobj.push(fob);
													serialize(k+1);
												}
												that.progressSpinner(k/loadparams.length,function() { aboutoabort = true});
												KViewer.dataManager.loadData(loadparams[k]);

											}
										}
									}

									serialize(0);

/*
									for (var k = 0; k < loadparams.length;k++)
									{
										loadparams[k].progressSpinner = that.progressSpinner;	
										KViewer.dataManager.loadData(loadparams[k]);
									}
*/
									
								}
					 , that.progressSpinner)

				
				}
				else if (callback)
					callback(loadedFobj);
			}


			function updateRecent(files)
			{
				 if (files == undefined)
				 	return;
				 fs.readFile("./recent.json",undefined, function(err,content)
					 {
						var recent = {};
						var offs = 0;
					 	if (content != undefined)
					 	{
					 		var names= JSON.parse(content);					 			
					 		for (var k = 0;k < names.length;k++)
					 			recent[names[k]] = k;
					 		offs = names.length;
					 	}

						if (files.length > 5)
							files = files.slice(0,5);

						for (var k = 0;k < files.length;k++)
						    recent[files[k]] = offs+k;

						var recent = Object.keys(recent);					    
					 	if (recent.length>10)
							recent = recent.slice(recent.length-10,recent.length);

						fs.writeFile("./recent.json",JSON.stringify(recent),undefined,function(){
							ipc.send('rebuild-menu');
							
						});
					 });
 			 }
			


  }



  that.runningBlobIndex=0
  that.loadBlob = function(blob,name,callback)
  {
		that.runningBlobIndex++;
		var id = "blob" + that.runningBlobIndex;
		KViewer.dataManager.loadData({URLType:'cachefile',
			fileID:id,
			fileinfo:{Filename:name,ID:id},
			file:blob,
			callback: callback
			})
 
  }




  $("<li><a>Close All</a></li>").click(function(){
    signalhandler.send("close");
    dataman.clearMemory();
    master.roiTool.clearAll();
    that.update();
   }  ).appendTo($menu);
	 
  $menu.append($("<hr width='100%'> ")); 					 					

  if (!electron)
  {

	  $("<li><a>Upload local files</a></li>").click(function() { uploadAll() } ).appendTo($menu);
	  $("<li><a>Upload local files with native PID</a></li>").click(function() { uploadAll('useinternalPSID') } ).appendTo($menu);
	  $menu.append($("<hr width='100%'> ")); 					 					
  }

  var sel = '';
  if (state.viewer.zippedUpload)
	  sel = 'check-';
  var $zup;
   $menu.append($zup = $("<li> zipped upload/save <i class='fa fa-"+sel+"circle-o'></i> </li>").click(
   function()
   {
		var $fa = $zup.find(".fa");
   	    if (state.viewer.zippedUpload)
   	    {
   	      state.viewer.zippedUpload = false;
   	      $fa.removeClass("fa-check-circle-o").addClass("fa-circle-o");
   	    }
   	    else
   	    {
   	      state.viewer.zippedUpload = true;
   	      $fa.addClass("fa-check-circle-o").removeClass("fa-circle-o");
   	    }


   }))

   that.$topRow.on('mouseenter',
   function()
   {
		var $fa = $zup.find(".fa");
   	    if (state.viewer.zippedUpload)
   	      $fa.addClass("fa-check-circle-o").removeClass("fa-circle-o");
   	    else
   	      $fa.removeClass("fa-check-circle-o").addClass("fa-circle-o");
   });


  that.$topRow.append( $("<li><a>Workspace</a></li>").append($menu) );

  var $menu2 = $("<ul ></ul>");
  var $diskcache =  $("<a></a>").appendTo($("<li></li>").appendTo($menu2));  
  $("<li><a>Clear Disk Cache</a></li>").click(function(){storage.clear().then(that.update); }).appendTo($menu2);
  var $diskcachehead = $("<li><a> DiskCache</a> </li>");
  that.$topRow.append($diskcachehead.append($menu2) );
 
  that.$topRow.append( $("<li><a>DicomWeb</a></li>").click(function(e)
  {
         var prompt = "Paste a dicomweb link to a series or a study";
         if (typeof lastDicomWebLink == "undefined")
          lastDicomWebLink="";
         alertify.prompt(prompt, function(e,str)
         {
         	if (e)
         	{
                loadDICOMwebURL(str);
                lastDicomWebLink = str;
         	}
         },lastDicomWebLink );
  	
   } ))


  var $innerDIV = $("<div ondragover='event.preventDefault();' class='annotation_tool_listDIV'></div>").appendTo(that.$container);
 

  if (!KViewer.standalone && userinfo.username==guestuser)
  {
  	    that.$leftToolistDiv.remove();
        $innerDIV.css("width","100%");
  }
 

  if (userinfo.username == guestuser)
  {
     //that.$leftToolistDiv.remove();
     //$innerDIV.css("width","100%");
  }

  var $table = $("<table cellspacing=0 class='localfiletable'></table>").appendTo($innerDIV);
  that.handleDrop = function(e)
  {
  	//if (e.isDefaultPrevented && e.isDefaultPrevented()) // what's this???
	//	return;
   
    e.preventDefault();
    e.stopPropagation();

	createLoadParamsFileDrop(e, function (loadparams)
	{
		for (var k = 0; k < loadparams.length;k++)
		{
			loadparams[k].progressSpinner = that.progressSpinner;		 
			if (userinfo.username == guestuser | $.isNumeric(loadparams[k].fileID) | loadparams[k].buffer != undefined)
				KViewer.dataManager.loadData(loadparams[k]);
			else      
				KViewer.dataManager.loadProxy(loadparams[k],false);
		}

		KViewer.cacheManager.update();

	},that.progressSpinner);

    cleanAllDropIndicators();
  
  }
  that.$container[0].ondrop = that.handleDrop;
  that.$container.on("dragover",function(e)
  {
  	return false;
  });




  /***************************************************************************************
   * resize callback
   ****************************************************************************************/

  that.resize = function(hei)
  {
      that.$container.height(hei);
      $innerDIV.height(hei-that.$container.find('.KToolsTopMenu').height());
  }


  /***************************************************************************************
   * update the tool table
   ****************************************************************************************/


  that.update = function()
  {
    $table.children().remove();
  
  	var $thead = $("<thead>").appendTo($table);
    var $row = $("<tr ></tr>").appendTo($thead);
    $row.append($("<td class='fixedwidth' preventsortable='1' fixedwidth='7' ><i class='fa fa-square-o'></i></td>").click(function(e){ toggle_all(); }));
    $row.append($("<td class='fixedwidth' preventsortable='1' fixedwidth='7'></td>"));
    $row.append($("<td class='fixedwidth' preventsortable='1' fixedwidth='7'></td>"));
    $row.append($("<td>FID </td>"));
    $row.append($("<td>filename&nbsp&nbsp&nbsp</td>"));
    $row.append($("<td>subfolder</td>"));
    $row.append($("<td>type</td>"));
    $row.append($("<td>size</td>"));
    $row.append($("<td>PID</td>"));
    $row.append($("<td>SID</td>"));

  	var $tbody = $("<tbody>").appendTo($table);
    var filelist = dataman.getFileList();
    for  (var k =0; k < filelist.length; k++)
    {

       var fobj = dataman.getFile(filelist[k]);
       var id = fobj.fileID;

       if (id == undefined) // probably a bad bug, if this happens
       		continue;

       if (id.substring(0,5) == "atlas")
       	  continue;
 
       var dragstuff = "draggable='true' data-type='file' data-piz='' data-sid='' data-tag='"+fobj.fileinfo.Tag+"' data-filename='"+fobj.filename+"' data-subfolder='' data-fileID='"+fobj.fileID+"' data-mime='"+fobj.contentType+"'";
       dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ";
       
       // dblclick makes problems for example with delete button. No solution so far
       var $row = $("<tr  ondblclick='loadDataOndblClick(event);' class='filecache' " + dragstuff + "></tr>").appendTo($tbody);
       if (fobj.modified) 
           $row.addClass("modified");
       $row.on("contextmenu", function (ev) { fileCacheContextMenu(ev); });
       $row.append($("<td><i class='fa fa-square-o'></i> </td>").dblclick(function(e) {return false;}).click(function(e){ toggle_file(e.target); return false; }));


	   //var editable = id.substring(0,9) == "localfile" | id.substring(0,5) == "proxy" | fobj.modified;
       $row.append($("<td> <i class='tablebutton fa fa-fw fa-trash'></td>").click(function(k) {return function(ev){ev.preventDefault();ev.stopPropagation();
			ignoreDblClickBeforeClose(ev);
	  		 master.dataManager.delFile(k); that.update();  return false;} }(fobj.fileID) ));


       if (fobj.editable | fobj.proxyev != undefined)
       {
         var $up = $("<i class='tablebutton fa fa-fw fa-upload'></i>").on('click', function(e) { prepTarget(e.target); uploadFiles(); });
         if (userinfo.username != guestuser)
              $row.append($("<td></td>").append($up));
         else
              $row.append($("<td></td>"));
       }
       else
         $row.append($("<td> </td>"));


       if (id.substring(0,9) == "localfile" || id.substring(0,5) == "proxy" )
          $row.append($("<td>local</td>"));
       else
          $row.append($("<td>" + id + "</td>"));


	   //var editable = id.substring(0,9) == "localfile" | id.substring(0,5) == "proxy" | fobj.modified;

	   var types = {
	   	 nii: "image imgTag",
	   	 bmp: "file-image-o",
	   	 ano: 'comment-o AnoTag',
	   	 form: "file-text-o FormTag",
	   	 json: "file-o",	   	 
	   	 pdf: "file-pdf-o",
	   	 txt: "file-text-o",
	   	 tracts: "tree fiberTag"
	   };


		var symbol = "??";
		if (types[fobj.contentType] != "undefined")
		  symbol = "<i class='KTreeSymbol fa fa-" + types[fobj.contentType] +  " fa-fw' ></i>  ";



	

      var $namediv = $("<div >" + symbol + fobj.filename + " </div>").appendTo($("<td></td>").appendTo($row));
      if (fobj.editable)
			KSetContentEditable($namediv,function(sel) { return  function($el) 
			   {
						sel.filename = $el.text().trim(); 
						if (sel.namedivs != undefined)
							for (var i = 0; i < sel.namedivs.length;i++)
								$(sel.namedivs[i]).text(sel.filename);
			   } }(fobj),undefined,true);
			   
	  

	  var subf = (fobj.fileinfo.SubFolder || "/");
      var $subdiv = $("<div>" + subf + " </div>").appendTo($("<td></td>").appendTo($row));
      if (fobj.editable)
			KSetContentEditable($subdiv,function(sel) { return  function($el) 
			   {
						sel.fileinfo.SubFolder = $el.text().trim(); 
			   } }(fobj),undefined,true);

       
       if ((fobj.fileinfo.Tag || "").search("/mask/") >= 0)
          $row.append($("<td> ROI </td>"));
       else
       {
		  if (fobj.contentType == "nii")
		  {
			$row.append($("<td> " + fobj.content.filetype +" (" +fobj.content.sizes+")</td>")); 
		  } 
		  else       
            $row.append($("<td>" + fobj.contentType +"</td>"));
       }
 

       $row.append($("<td>" + toFileSize(fobj.fileinfo.filesize) + " </td>"));



    
          
  
       $row.append($("<td>" + fobj.fileinfo.patients_id + "</td>"));
       $row.append($("<td>" + fobj.fileinfo.studies_id + "</td>"));

     }
     if (electron)
	 	that.tablestate = {viscol:[true, false, false, true, false, true, true, true, false, false] };
	 else 	
	    if (that.tablestate == undefined)
	     	that.tablestate = {viscol:[true, true, true, false, true, true, true, true, false, false] };

     that.attachTableOperator($table.parent(),undefined,true);

     if (storage != undefined)
     {
       $diskcachehead.show();
       function showsum(sum)
       {        
          var used = 100*sum/storage.getCapacity();
//          $diskcache.text("used " + used.toFixed(0) + "%");
          $diskcache.text("used " + (sum/1024/1024).toFixed(0) + " MB");
          if (used > 95)
          { 
              $diskcachehead.css('color','red');
              $diskcache.css('color','red');
          }
          else
          { 
              $diskcachehead.css('color','');
              $diskcache.css('color','');
          }

       }

       storage.ls().then(function(docKeys) {
          var sum = 0;
          var fun = function () {storage.getContents(docKeys[0]).then(
              function(content)
              {
                  if (docKeys.length > 0)
                  {
                    docKeys.splice(0,1);
                    if (content != "")
                    {
                    	var finfo = JSON.parse(content);
                    	if (finfo.filesize != undefined)                    	
                    		sum += finfo.filesize
                    }
                    fun();
                  }
                  else
                  {
                    showsum(sum);
                    storage.size = sum;
                  }
              }) };  fun(); })
    }
    else
      $diskcachehead.hide();


    function toggle_file(target)
    {
      if (!$(target).hasClass("fa"))
         target = $(target).parent().find(".fa");
      toggle(target);
    }

    function toggle(target)
    {
      $(target).toggleClass("fa-square-o");
      $(target).toggleClass("fa-check-square-o");
      $(target).parent().parent().toggleClass("selected");
    }

    function toggle_all()
    {
       var rows = $table.find("tr");
       for (var k = 1; k < rows.length;k++)
          toggle($(rows[k]).find(".fa-square-o,.fa-check-square-o"));
    }

    function getVisible()
    {
       var visible = [];
       for (var fid in visibleROIs)
       {
          visible.push(master.dataManager.files[fid].content);
       }
       return visible;
    }
    that.getVisible = getVisible;

 	signalhandler.send('cacheManagerUpdate')

  }
  

  /***************************************************************************************
   * update the tool table
   ****************************************************************************************/  

  function uploadAll(usenativePID)
  {
      var fids = KViewer.dataManager.getFileList();
      tempObjectInfo = [];
      for (var k = 0; k < fids.length ;k++)
      {
 		  var modified = false;
 		  var fobj = KViewer.dataManager.getFile(fids[k]);
 		  if (fobj.modified)
 		  	modified = true;
      	  
          if (fids[k].substring(0,5) == 'local' | fids[k].substring(0,5) == 'proxy' | modified)
              tempObjectInfo.push({fileID:fids[k]});
      }
      uploadFiles(that.progressSpinner,usenativePID);
  }



  /***************************************************************************************
   * upload files
   ****************************************************************************************/  


  function uploadFiles(progress,usenativePID)
  {
     var filesToUpload = tempObjectInfo;
     tempObjectInfo = [];

	 if (progress == undefined)
	 	progress = that.progressSpinner;


     function doTheUpload()
     {
      
          var fi = KViewer.dataManager.getFile(filesToUpload[0].fileID);
		  var finfo = {SubFolder:"",Tag:"",permission:"rwp"};
		  if (fi.fileinfo && fi.fileinfo.SubFolder)
		  		finfo.SubFolder = fi.fileinfo.SubFolder.replace(/^\/|\/$/g, "");

		  var zip = false;
		  if (state.viewer.zippedUpload)
		  	zip = true;

          if (!uploadBinary(fi,finfo,
          function (id,response)
          {
               if (id.substring(0,5) == 'proxy')
               {
                  KViewer.dataManager.delFile(id);  
               }
               else
               {
                 var newid = response.fileID;
                 var fi = KViewer.dataManager.getFile(id);
                 if (newid != id)
                 {                    
                   fi.fileID = newid;
                   KViewer.dataManager.setFile(newid,fi);
                   KViewer.dataManager.delFile(id,true);
                 }
                 fi.modified = false;
               }

               KViewer.cacheManager.update();
               if (ViewerSettings.selectionMode[1] == 'f')
				   refreshButton();
               else
               	   patientTableMirror.mirrorState();
               filesToUpload.splice(0,1);
               if (filesToUpload.length > 0)
                   doTheUpload();

          },progress,zip,usenativePID)) { filesToUpload.splice(0); }
     }
     doTheUpload();
  
  }
  that.uploadFiles = uploadFiles;

  function prepTarget(target)
  {
      for (var k = 0;k< 3;k++)
      {
        if ($(target).is("tr"))
           break;
        target = $(target).parent();
      }
      prepObjectInfo(target);
      return target;
  }
  that.prepTarget = prepTarget;



  /***************************************************************************************
   * filecontext menu
   ****************************************************************************************/ 
 
  var fileCacheContextMenu = KContextMenu(
  function(ev) {
      var target = prepTarget(ev.target)
      var $menu = $("<ul class='menu_context'>")

      if (tempObjectInfo[0].mime == "nii")
      {
          $menu.append($("<li onchoice='openasroi' >Open as ROI </li>"));
          $menu.append($("<li onchoice='cloneasroi' >Clone as ROI </li>"));
      }
      if (tempObjectInfo[0].mime == "json")
      {
          $menu.append($("<li onchoice='openasanno' >Open as annotation</li>"));
          $menu.append($("<li onchoice='openastrans' >Open as transformation</li>"));
      }
      if (userinfo.username != guestuser & (tempObjectInfo[0].fileID.search('local')>-1 | tempObjectInfo[0].fileID.search('proxy')>-1))
      {
//        $menu.append($("<li onchoice='assignpid' >Assign PID </li>"));
//        $menu.append($("<li onchoice='assignsid' >Assign SID </li>"));
        $menu.append($("<li onchoice='upload' >Upload </li>"));
      }
      $menu.append($("<li onchoice='download' >Download </li>"));
      $menu.append($("<li onchoice='remove' >Remove </li>"));


      return $menu;
  },
  function (str,ev)
  {
      if (str=="openasroi")
      {
          for (var k = 0; k < tempObjectInfo.length;k++)
              KViewer.roiTool.pushROI(tempObjectInfo[k].fileID,tempObjectInfo[k].filename,'frommaskfile');
      } 
      if (str=="cloneasroi")
      {
          for (var k = 0; k < tempObjectInfo.length;k++)
              KViewer.roiTool.pushROI(tempObjectInfo[k].fileID,'untitled');
      } 
      if (str=="openasanno")
      {
          for (var k = 0; k < tempObjectInfo.length;k++)
          {
               var c = KViewer.dataManager.getFile(tempObjectInfo[k].fileID).content;
               KViewer.annotationTool.loadAnnotations({content:c});
          }
          if (!KViewer.annotationTool.$toggle.hasClass("KView_tool_enabled"))
               KViewer.annotationTool.$toggle.trigger("click");
      }
      else if (str=="assignpid" | str == "assignsid")
      {
         var prompt = "Enter " + (str=="assignpid")?"PID":"SID";
         var field = (str=="assignpid")?"patients_id":"studies_id";
         alertify.prompt(prompt, function(e,str)
         {
            for (var k = 0; k < tempObjectInfo.length;k++)
              KViewer.dataManager.getFile(tempObjectInfo[k].fileID).fileinfo[field] = str;
            KViewer.cacheManager.update();
         } );

      }
      else if (str=="upload")
      {
        uploadFiles();
      }
      else if (str=="download")
      {
          for (var k = 0; k < tempObjectInfo.length;k++)
             saveNiftilocal(KViewer.dataManager.getFile(tempObjectInfo[k].fileID));
         
      }
      else if (str=="remove")
      {
         for (var k = 0; k < tempObjectInfo.length;k++)
         {	  
            KViewer.dataManager.delFile(tempObjectInfo[k].fileID);
            if (KViewer.roiTool.ROIs[tempObjectInfo[k].fileID])
                delete  KViewer.roiTool.ROIs[tempObjectInfo[k].fileID];
         }	   
         KViewer.cacheManager.update();
         KViewer.roiTool.update();
      }

  }, true);


 // that.update();
  return that;
}


function KFileEntry(filepath)
{
	return function ()
	 {
	 	try 
	 	{
			var stat = fs.statSync(filepath);
	 	}
	 	catch(err)
	 	{
	 		return {error:err};
	 	}
		if (stat.isDirectory())
		{
		   return { name: filepath, local:true ,isDir:true,
			 createReader: function() {
				return { readEntries: function (cb)
				{
					if (this.isread)
						cb([]);
					else
					{
						this.isread = true;
						fs.readdir(filepath,function(err,files) { 
							for (var k = 0;k < files.length; k++)
								files[k] = KFileEntry(filepath + "/" + files[k])();
							cb(files); 

						} );
					}
				}


			 } } }
		}
		else 
		   return { name: filepath, local:true };
	 } 
}