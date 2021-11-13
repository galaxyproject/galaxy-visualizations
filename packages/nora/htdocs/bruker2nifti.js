
var BrukerReader = {};

BrukerReader.checkForBrukerData = function (params)
{

        var bruker = {};
        for(var k=0;k<params.length;k++)
        {
            if(params[k].filename)
            {
                if(params[k].filename.substring(params[k].filename.length-5) == "2dseq")
                        bruker.datafile = params[k];
                if(params[k].filename.substring(params[k].filename.length-9) == "visu_pars") // visu_pars is the best
                     bruker.headerfile = params[k];
                if(params[k].filename.substring(params[k].filename.length-6) == "method") // visu_pars is the best
                     bruker.headerfile = params[k];
            }
        }

        if(Object.getOwnPropertyNames(bruker).length > 0)
        {
            if (params.parent && params.parent.parent)
            {
                var pparams = params.parent.parent;
                for (var k = 0; k < pparams.length;k++)
                {
                    var splitted = pparams[k].filename.split("/");
                    var fname = splitted[splitted.length-1];
                    if (fname == 'method')
                    {
                        bruker.methodfile = pparams[k];
                        if ( pparams[k].file &&  pparams[k].file.fullPath)
                        {
                            var pathseq = pparams[k].file.fullPath.split("/");
                            bruker.AcqNum = pathseq[pathseq.length-2];
                        }
                        break;
                    }

                }
            }


            return bruker;
        }
        else
            return;
}







BrukerReader.loadBruker = function (bruker,callback,name)
{
    // chekc if both files are included
    if(bruker.headerfile == undefined | bruker.datafile == undefined)
    {
        callback([]);
        return false;
    }

    var hdr_params = bruker.headerfile;
    var data_params = bruker.datafile;
    var method_params = bruker.methodfile;
    hdr_params.callback =  function(fobj_hdr) { 
            data_params.callback = function(fobj_data)
            {
                if (method_params != undefined)
                {
                    method_params.callback = function(fobj_method)
                    {
                        BrukerReader.vis2dseq2Nifti(fobj_hdr, fobj_data, fobj_method,bruker.AcqNum, callback);                 
                    }
                    KViewer.dataManager.loadData(method_params);
                }
                else
                    BrukerReader.vis2dseq2Nifti(fobj_hdr, fobj_data, undefined,name, callback);
            } 
            KViewer.dataManager.loadData(data_params);
    }
    KViewer.dataManager.loadData(hdr_params);

}



BrukerReader.vis2dseq2Nifti = function (fobj_hdr, fobj_data,fobj_method, acqnum, callback)
{
        var brk = BrukerReader.bruker2nifti(fobj_hdr, fobj_data,fobj_method);
        var visu_pars = brk.visu_pars;
        var fileName_pattern = '<AcquisitionProtocol>';

        var k = 0;
        var matches = fileName_pattern.match(/\<\w+\>/g);
        var fname = fileName_pattern;
        for (var j = 0; j < matches.length; j++)
          {
             var key = 'Visu' + matches[j].substr(1,matches[j].length-2);
             if (visu_pars[key] == undefined)
             {
                  console.log(key + " is undefined: " + fobj_hdr.fileinfo.SubFolder+"/"+fobj_hdr.fileinfo.filename);
                  fname = fname.replace(matches[j],"undefined" + k);
                  k++;
             }
             else
              fname = fname.replace(matches[j],visu_pars[key].content[0]);
          }


        fobj_data.content = prepareMedicalImageData(parse(brk.buffer), fobj_data, {});
        fobj_data.contentType = 'nii';
        fobj_data.filename    = fname + ".nii";
        fobj_data.fileID = "localfile_" + fname + '_' +  acqnum;
        fobj_data.fileinfo.SubFolder = acqnum;
        fobj_data.fileinfo.patients_id = visu_pars.VisuSubjectId.content[0].replace(/[^a-zA-Z0-9]/g,"");
        fobj_data.fileinfo.studies_id = "#" + visu_pars.VisuStudyId.content[0].replace(/[^a-zA-Z0-9]/g,"");
        fobj_data.fileinfo.FamilyName = visu_pars.VisuSubjectId.content[0];
        fobj_data.fileinfo.Sex = visu_pars.VisuSubjectSex.content[0] || 'N';
        KViewer.dataManager.setFile(fobj_data.fileID,fobj_data);
      



        if (brk.bvals.length > 0)
          {
            var bvals = brk.bvals;
              
            var bvalstr = "";
            var bvecXstr = "";
            var bvecYstr = "";
            var bvecZstr = "";
            for (var j = 0; j < bvals.length; j++)
            {
                bvalstr += bvals[j].ev + " ";
                var v = bvals[j].v;
                bvecXstr += v._data[0] + " ";
                bvecYstr += v._data[1] + " ";
                bvecZstr += (v._data[2]) + " ";
            }

            var fobjs_bvals = { };
            fobjs_bvals.fileID = fobj_data.fileID + "bval";
            fobjs_bvals.content = bvalstr + "\n" ;
            fobjs_bvals.contentType = 'txt';
            fobjs_bvals.filename    = fname + ".bvals";
            fobjs_bvals.fileinfo = $.extend({},fobj_data.fileinfo);
            KViewer.dataManager.setFile(fobjs_bvals.fileID,fobjs_bvals);
      
            var fobjs_bvecs = { };
            fobjs_bvecs.fileID = fobj_data.fileID + "bvec";
            fobjs_bvecs.content =  bvecXstr + "\n" + bvecYstr + "\n" + bvecZstr + "\n";
            fobjs_bvecs.contentType = 'txt';
            fobjs_bvecs.filename    = fname + ".bvecs";
            fobjs_bvecs.fileinfo = $.extend({},fobj_data.fileinfo);
            KViewer.dataManager.setFile(fobjs_bvecs.fileID,fobjs_bvecs);


//            fs.writeFileSync(finalname + ".bvec", bvecXstr + "\n" + bvecYstr + "\n" + bvecZstr + "\n");
          }






        KViewer.cacheManager.update();
        if (callback)
            callback(fobj_data, {});

}


BrukerReader.readHdr = function(brukerhdr)
{
    var hdr = {};

    brukerhdr = ab2str(brukerhdr);

    var items = brukerhdr.split('##$');
    for (var k = 0; k < items.length; k++)
    {
        var lines = ksplit(items[k],'\n'); 
        if (lines.length == 0)
            continue;      
        var h = lines[0].split('=');
        var name = h[0].trim();
        var params = h[1].trim().replace(/\(/g,"").replace(/\)/g,"").split(",").map(function(x) { return x.trim() });
        if (!isNaN(parseInt(params[0])))
            params = params.map(function(x) {return parseInt(x) });
        lines = lines.slice(1);
        var content = [];
        if (lines.length > 0)
        {
            if (lines[0].trim()[0] == '<' || lines[0].trim()[0] == '#' || lines[0].trim()[0] == '$') // strings
                content = ksplit(lines,"<>");
            else
                content = ksplit(lines," ").map(function(x) {
                     var num = parseFloat(x);
                     if (!isNaN(num))
                        return num;
                     else
                        return x;
                  });;
        }
        hdr[name] = {param : params, content : content};
    }
    hdr.raw = brukerhdr;
    return hdr;

}


function ksplit(x,delims)
{
    var r = x;
    if (typeof r == "string")
       r = [r];
    for (var k = 0;k < delims.length;k++)
    {
        r = r.map(function(y) { return y.split(delims[k]).filter( function (x) { return x!=""}); });
        r = [].concat.apply([],r);      
    }
    return r;
}




BrukerReader.bruker2nifti = function(hdrfi, databufferfi,methodfi)
{
    var method;
    if (methodfi)
        method = BrukerReader.readHdr(methodfi.content);

    if (databufferfi == undefined)
        return;

    var hdr = BrukerReader.readHdr(hdrfi.content);
    hdr.raw = hdrfi.content;

    var databuffer = databufferfi.content;

    // this is a default nifti buffer in uint8 representation.
    var niihdr = [92,1,0,0,117,105,110,116,49,54,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,114,0,1,0,16,0,16,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,16,0,0,0,0,0,128,191,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,111,110,101,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,105,49,0,0,0,0,0];  
    var buffer = (new Uint8Array(niihdr)).buffer;
 

    var sx,sy,sz,st, vx,vy,vz, edges, datatype; 
    var littleEndian = true;
    // assume uint16 as default           
    var datatype = 512;       
            var brukerhdr = hdr.raw;

  
    {
      
            vx = hdr.VisuCoreExtent.content[0]/hdr.VisuCoreSize.content[0];
            vy = hdr.VisuCoreExtent.content[1]/hdr.VisuCoreSize.content[1];
            vz = 1;
            if (hdr.VisuCoreExtent.param[0] > 2)            
                vz = hdr.VisuCoreExtent.content[2]/hdr.VisuCoreSize.content[2];
            
            sx = hdr.VisuCoreSize.content[0];
            sy = hdr.VisuCoreSize.content[1];
            if (hdr.VisuCoreSize.param[0] > 2)
                sz = hdr.VisuCoreSize.content[2];
            else
                sz = 1
            st = hdr.VisuCoreFrameCount.param[0];

            var framesAreSlice = false;
            if(sz==1 & st >1   ) // slices are in frames ...?
            {
                // could still be a mess between slices and time frames (DTI)
                // only way to find out so far is with visuCore first params
                 if(1) //vp.VisuCoreOrientation  )
                 {
                     sz = nSlices = hdr.VisuCoreOrientation.param[0]; //parseInt(vp.VisuCoreOrientation[0].split(' ')[0]);
                     st = st / sz;
                 }
                 else
                 {
                     sz = st;
                     st = 1;
                 }
                 framesAreSlice  = true;
            }


            
            {
                var orient = hdr.VisuCoreOrientation.content;  //vp.VisuCoreOrientation[1].trim().split(/\s+/);  
                var offset = hdr.VisuCorePosition.content; //vp.VisuCorePosition[1].trim().split(/\s+/);
                if(framesAreSlice & offset.length>3) // calculate the z-vox size from slice distances for multiframe data
                {
                    var x = 0;
                    for(var k=0; k< 3; k++)
                    { x +=  function (a,b){ return (parseFloat(a) - parseFloat(b))*(parseFloat(a) - parseFloat(b))  }(offset[k], offset[k+3]); }
                    vz = parseFloat(math.sqrt(x).toFixed(3));
                }

                for(var k=0;k<12;k++) { orient[k] = parseFloat(orient[k]); }
                for(var k=0;k<6;k++)  { offset[k] = parseFloat(offset[k]); }
                

                edges = (new Array(3)).fill(Array(3));
                edges[0] =  orient.splice(0,3); 
                edges[1] =  orient.splice(0,3);
                edges[2] =  orient.splice(0,3);



                edges = kmath.matrix(math.inv(edges))._data;
                
                // add the offset
                edges[0] = edges[0].concat(offset[0]); 
                edges[1] = edges[1].concat(offset[1]); 
                edges[2] = edges[2].concat(offset[2]); 
                edges[3] = [0, 0, 0, 1];




                if(! isNaN(offset[3]) ) // try to get the slice order. Only works if second slice available    
                {
                    var v1 =  math.multiply(edges, [offset[0], offset[1], offset[2],1]);
                    var v2 =  math.multiply(edges, [offset[3], offset[4], offset[5],1]);
                    var d = math.matrix(math.add(v1, math.multiply(v2,-1)))._data;
                    var sliceOrder = -math.sign(d[2]);
                }
                else
                {
                    sliceOrder = 1;
                }


                var voxCorrection = math.diag([vx,vy,vz*sliceOrder,1]);

//                var permuationMatrix = (  [[1,0,0,0],[0,-1,0,0],[0,0,1,0],[0,0,0,1]]  );
                
//                edges = ( math.multiply((permuationMatrix), edges));


                var saved_edges = edges;

                edges = math.multiply( edges,    voxCorrection);
    

                if (hdr.VisuCoreDiskSliceOrder != undefined &&  hdr.VisuCoreDiskSliceOrder.param == "disk_reverse_slice_order")
                    edges = math.multiply(edges, [[1 ,0, 0, 0 ],[ 0, 1, 0, 0 ],[ 0, 0, -1, sz ],[0, 0, 0, 1]]);
                  
                

         //  console.log(print_matrix(edges));





                edges = edges._data;
                // make linear matrix
                edges = edges[0].concat(edges[1]).concat(edges[2]).concat(edges[3]);


           
            }


            // ======================

            // datatype: see into nifit.js . bruker datatype can contain underscore in beginning ... ? Be careful with signd and unsigned int
             var wordtype = hdr.VisuCoreWordType.param[0]; //vp.VisuCoreWordType;
           
            if (wordtype.search('8BIT_SGN_INT') > -1 )
                datatype = 256;       
            else if (wordtype.search('16BIT_SGN_INT') > -1)
                datatype = 512;       
            else if (wordtype.search('32BIT_SGN_INT') > -1)  // signed int 32
                datatype = 8;       

            // to be implemented
            //littleEndian =  (vp.VisuCoreByteOrder === 'littleEndian');   



        }


    var ndims = st>1?4:3;


    // set the bruker header to nifti header
    var view = new DataView(buffer);
    
 
    
    // sizes
    view.setInt32(0, 348,  littleEndian )
    view.setInt16(40, ndims,  littleEndian )
    view.setInt16(42, sx,  littleEndian )
    view.setInt16(44, sy,  littleEndian )
    view.setInt16(46, sz,  littleEndian )
    view.setInt16(48, st,  littleEndian )
    
    // edges
     var srow = new Float32Array(12);
    if(edges)
    {
        for(var i=0; i<12; i++) 
        {
            srow[i] = view.setFloat32(280+4*i, (edges[i]), littleEndian)
        }
    }
    // ====== apply some other important stuff
    // set the magic number to n+1
    view.setInt32(344, 1848324352,  !littleEndian )
    // set vox offset to 352
    view.setFloat32(108, 352, littleEndian) 
    // set datatype
    view.setInt16(70, datatype, littleEndian) 



    // pixdims
    view.setFloat32(76, -1,  littleEndian )
    view.setFloat32(80, vx,  littleEndian )
    view.setFloat32(84, vy,  littleEndian )
    view.setFloat32(88, vz,  littleEndian )




    // dataslope
    // NIFTI allows only one dataslope, whereas bruker has one for each slice stored
    // Hope that slope does not change between slices. Do a check
    if( hdr.VisuCoreDataSlope != undefined &&  hdr.VisuCoreDataSlope.content != undefined)
    {
        var dataslope  = hdr.VisuCoreDataSlope.content
        var isDifferent = false;
        for(var k=0; k<dataslope.length; k++)
        {
            if(dataslope[0] != dataslope[k])
                isDifferent = true;
        }  
        if(isDifferent)
        {
            console.log('Warning, different slopes for each slice! Cannot write the slope to the nifti: '+ hdrfi.fileinfo.SubFolder+"/"+hdrfi.fileinfo.filename)
        }
        else
        {
            view.setFloat32(112, dataslope[0],  littleEndian )
            view.setFloat32(116, hdr.VisuCoreDataOffs.content[0],  littleEndian )
        }
    }

    // qform=0, 
    view.setInt16(252, 0,  littleEndian )


    // change from big to little endian, since  nifti library can only handle these ...
//     var view = new DataView(databuffer.content.buffer);
//       for(var k=0; k<databuffer.content.buffer.byteLength; k +=2)
//           view.setUint16(k, view.getUint16(k, true) , false);


        var bvals = [];
         if (method && method.PVM_DwBMat)
          {
              var binfo = method.PVM_DwBMat;
              var n = binfo.param[0]; 
              var bmat = binfo.content;
              var reorienter = function(v) { return [v[0],v[1],-v[2]]; };
              if (method.PVM_SPackArrSliceOrient.content[0] == 'coronal')
                   reorienter = function(v) { return [v[1],v[0],-v[2]]; };

              for (var j = 0 ; j < n; j++)
              {
                  var ev = math.maxEV(math.matrix([ [bmat[9*j+0],bmat[9*j+1],bmat[9*j+2]],[bmat[9*j+3],bmat[9*j+4],bmat[9*j+5]],[bmat[9*j+6],bmat[9*j+7],bmat[9*j+8]] ]));
                  ev.v._data = reorienter(ev.v._data);
                  bvals.push(ev)
              }

          }



















 
    // combine the header and the dataarray    
    var tmp = new Uint8Array(buffer.byteLength + databuffer.buffer.byteLength);
    
    tmp.set(new Uint8Array(buffer), 0);

    //tmp.set(new Uint8Array(databuffer), buffer.byteLength);
    tmp.set(new Uint8Array(databuffer.buffer), buffer.byteLength);
    
    return {buffer: tmp, edges:saved_edges, visu_pars:hdr, bvals:bvals,method:method};

}









/*

BrukerReader.bruker2nifti = function(fobj_hdr, databuffer)
{


    // this is a default nifti buffer in uint8 representation.
    var niihdr = [92,1,0,0,117,105,110,116,49,54,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,114,0,1,0,16,0,16,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,16,0,0,0,0,0,128,191,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,111,110,101,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,191,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,63,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,110,105,49,0,0,0,0,0];  
    var buffer = Uint8Array.from(niihdr).buffer;
    
    brukerhdr = ab2str(fobj_hdr.content);
    var sx,sy,sz,st, vx,vy,vz, edges, datatype; 
    var littleEndian = true;
    // assume uint16 as default           
    var datatype = 512;       

    if  (fobj_hdr.filename.search("d3proc") > -1)
    {
        // ========== header type d3proc
       // var brukerhdr = "##$SEQTYPE=slices ##$DATTYPE=ip_short ##$IM_SIX=256 ##$IM_SIY=196  ##$IM_SIZ=48  ##$IM_SIT=1 ##$SIM_SIX=256 ##$SIM_SIY=196 ##$SIM_SIZ=48";


        var sx = parseInt( (/IM_SIX=(\d*)/g).exec(brukerhdr)[1] )
        var sy = parseInt( (/IM_SIY=(\d*)/g).exec(brukerhdr)[1] )
        var sz = parseInt( (/IM_SIZ=(\d*)/g).exec(brukerhdr)[1] )
        var st = parseInt( (/IM_SIT=(\d*)/g).exec(brukerhdr)[1] )

    }

    if  (fobj_hdr.filename.search("visu_pars") > -1)
    {
    
            // read important header fields
            //newlinedelim = '_newlinedelim_';
            //brukerhdr = brukerhdr.replace(/\n/g, newlinedelim)
            function getParamMultiline(myregexp, multilineparam)
            {
                var out = [false];
                var res = myregexp.exec(brukerhdr); 
                if(res !== null)
                {

                    out[0] = res[1]; // same line match;
                    out[1] = undefined; // following lines match
                    if(multilineparam)
                    {
                            var tempstring = brukerhdr.substr(res.index + res[0].length);
                            var ind = tempstring.search(/[\$#]+/); // find the next param line
                            out[1] = tempstring.substr(0, ind).replace(/\n/g, ' ');
                    }
                }
                return out;

            }
    
            // easy function for zero or one line matches.
            function getParam(myregexp,index) { return ( (myregexp.exec(brukerhdr) || [] )[index] ) || ""; }

            var vp = {};// bruker parameter set
            vp.VisuCoreWordType =    getParam(/##\$VisuCoreWordType=(\w+)\n/, 1);
            vp.VisuCoreByteOrder =   getParam(/##\VisuCoreByteOrder=(\w+)\n/, 1);

            vp.VisuCoreDim = getParam(/##\$VisuCoreDim=(\d+)\n/, 1);
            vp.VisuCoreFrameCount = getParam(/##\$VisuCoreFrameCount=(\d+)\n/, 1); 
            vp.VisuCoreSize = getParam(/##\$VisuCoreSize=\(\s(\d)\s\)\n([\d\s]+)\n/, 2).split(' ');
            vp.VisuCoreExtent = getParam(/##\$VisuCoreExtent=\(\s(\d)\s\)\n([\d\s.]+)\n/, 2).split(' ');
            
            // voxel sizes
            vx = 1;
            vy = 1;
            vz = 1;

            vx = parseFloat(vp.VisuCoreExtent[0]) / parseFloat(vp.VisuCoreSize[0]);
            vy = parseFloat(vp.VisuCoreExtent[1]) / parseFloat(vp.VisuCoreSize[1]);

            if(vp.VisuCoreExtent.length > 2)
                vz = parseFloat(vp.VisuCoreExtent[2]) / parseFloat(vp.VisuCoreSize[2]);
            

            // orientations
          //  vp.VisuCoreOrientation  =   getParamMultiline(/##\$VisuCoreOrientation=\(\s([\d\s.,]+)\)* /, true);
          //  vp.VisuCorePosition  =      getParamMultiline(/##\$VisuCorePosition=\(\s([\d\s.,]+)\)* /, true);
            
            sx = parseInt(vp.VisuCoreSize[0]);
            sy = parseInt(vp.VisuCoreSize[1]);
            sz = parseInt(vp.VisuCoreSize[2]) || 1;
            
            st = parseInt(vp.VisuCoreFrameCount);

            var framesAreSlice = false;
            if(sz==1 & st >1   ) // slices are in frames ...?
            {
                // could still be a mess between slices and time frames (DTI)
                // only way to find out so far is with visuCore first params
                 if(vp.VisuCoreOrientation  )
                 {
                     sz = nSlices = parseInt(vp.VisuCoreOrientation[0].split(' ')[0]);
                     st = st / sz;
                 }
                 else
                 {
                     sz = st;
                     st = 1;
                 }
                 framesAreSlice  = true;
            }


            // switched off;
            if(vp.VisuCoreOrientation )
            {
                var orient =  vp.VisuCoreOrientation[1].trim().split(/\s+/);  
                var offset = vp.VisuCorePosition[1].trim().split(/\s+/);
                if(framesAreSlice & offset.length>3) // calculate the z-vox size from slice distances for multiframe data
                {
                    var x = 0;
                    for(var k=0; k< 3; k++)
                    { x +=  function (a,b){ return (parseFloat(a) - parseFloat(b))*(parseFloat(a) - parseFloat(b))  }(offset[k], offset[k+3]); }
                    vz = parseFloat(math.sqrt(x).toFixed(3));
                }

                for(var k=0;k<12;k++) { orient[k] = parseFloat(orient[k]); }
                for(var k=0;k<6;k++)  { offset[k] = parseFloat(offset[k]); }
                

                // according to some manual, following relation holds
                // i = VisuCoreOrientation * p
                // where i =firstVoxelInImageSystem and p = VisuCorePosition    
                

                // orient = [1,0,0,0,1,0,0,0,1];
                edges = Array(3).fill(Array(3));
                edges[0] =  orient.splice(0,3); 
                edges[1] =  orient.splice(0,3);
                edges[2] =  orient.splice(0,3);

            

                edges = math.matrix(math.inv(edges))._data;
                
                // add the offset
                edges[0] = edges[0].concat(offset[0]); 
                edges[1] = edges[1].concat(offset[1]); 
                edges[2] = edges[2].concat(offset[2]); 
                edges[3] = [0, 0, 0, 1];

                if(! isNaN(offset[3]) ) // try to get the slice order. Only works if second slice available    
                {
                    var v1 =  math.multiply(edges, [offset[0], offset[1], offset[2],1]);
                    var v2 =  math.multiply(edges, [offset[3], offset[4], offset[5],1]);
                    var d = math.matrix(math.add(v1, math.multiply(v2,-1)))._data;
                    var sliceOrder = -math.sign(d[2]);
                }
                else
                {
                    sliceOrder = 1;
                }


                var voxCorrection = math.diag([vx,vy,vz*sliceOrder,1]);

                var permuationMatrix = (  [[1,0,0,0],[0,-1,0,0],[0,0,1,0],[0,0,0,1]]  );
                
                edges = ( math.multiply((permuationMatrix), edges));
                edges = math.multiply( edges,    voxCorrection)
                edges = edges._data;
                // make linear matrix
                edges = edges[0].concat(edges[1]).concat(edges[2]).concat(edges[3]);

                //KViewer.applyState()
           
            }






            // ======================

            // datatype: see into nifit.js . bruker datatype can contain underscore in beginning ... ? Be careful with signd and unsigned int
           
            if( vp.VisuCoreWordType.search('8BIT_SGN_INT') > -1 )
                datatype = 256;       
            else if( vp.VisuCoreWordType.search('16BIT_SGN_INT') > -1)
                datatype = 512;       
            else if( vp.VisuCoreWordType.search('32BIT_SGN_INT') > -1)  // signed int 32
                datatype = 8;       

            // to be implemented
            //littleEndian =  (vp.VisuCoreByteOrder === 'littleEndian');   



        }



    //  PARAVISION 6 ==> header type "reco""
    else if  (fobj_hdr.filename.search("reco") > -1)
    {


        var diminfo = (/RECO_size=.+(\d).+\n(.+)\n/g).exec(brukerhdr); 
        if((diminfo || [0]).length < 3)
        {
            alertify.message("sorry, could not determine the dimension info");
            return false;
        }
        var dims = diminfo[2].split(" ");
            //var diminfo = (/RECO_size=.+(\d).+\n(\d+)\s(\d+)\s(\d+)\s/g).exec(brukerhdr) 

        var ndims = dims.length;
        sx = parseInt( dims[0] )
        sy = parseInt( dims[1] )
        if(ndims == 3)
            sz = parseInt( dims[2] )
        else if(ndims == 2)
            var sz = 1;

        st = parseInt( (/RecoObjectsPerRepetition=(\d*)/g).exec(brukerhdr)[1] ) || 1;
        if(sz==1 & st >1   )
            {
                sz = st;
                st = 1;
            }

    }
    var ndims = st>1?4:3;


    // set the bruker header to nifti header
    var view = new DataView(buffer);
    
    // sizes
    view.setInt32(0, 348,  littleEndian )
    view.setInt16(40, ndims,  littleEndian )
    view.setInt16(42, sx,  littleEndian )
    view.setInt16(44, sy,  littleEndian )
    view.setInt16(46, sz,  littleEndian )
    view.setInt16(48, st,  littleEndian )
    
    // edges
     var srow = new Float32Array(12);
    if(edges)
    {
        for(var i=0; i<12; i++) 
        {
            srow[i] = view.setFloat32(280+4*i, (edges[i]), littleEndian)
        }
    }



    // ====== apply some other important stuff
    // set the magic number to n+1
    view.setInt32(344, 1848324352,  !littleEndian )
    // set vox offset to 352
    view.setFloat32(108, 352, littleEndian) 
    // set datatype
    view.setInt16(70, datatype, littleEndian) 


   //     view.getFloat32(280+4, littleEndian)

    // change from big to little endian, since  nifti library can only handle these ...
//     var view = new DataView(databuffer.content.buffer);
//       for(var k=0; k<databuffer.content.buffer.byteLength; k +=2)
//           view.setUint16(k, view.getUint16(k, true) , false);

 
    // combine the header and the dataarray
    var tmp = new Uint8Array(buffer.byteLength + databuffer.content.byteLength);
    tmp.set(new Uint8Array(buffer), 0);
    tmp.set(new Uint8Array(databuffer.content), buffer.byteLength);
    
    return tmp;

}


*/


