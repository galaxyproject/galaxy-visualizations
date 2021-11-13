//"use strict"
//var assert = require('assert')

// good explanation
// https://brainder.org/2012/09/23/the-nifti-file-format/

//alert(1);

var systemEndianness = (function() {
    var buf = new ArrayBuffer(4),
        intArr = new Uint32Array(buf),
        byteArr = new Uint8Array(buf)
    intArr[0] = 0x01020304
    if (byteArr[0]==1 && byteArr[1]==2 && byteArr[2]==3 && byteArr[3]==4) {
        return 'big'
    } else if (byteArr[0]==4 && byteArr[1]==3 && byteArr[2]==2 && byteArr[3]==1) {
        return 'little'
    }
    console.warn("Unrecognized system endianness!")
    return undefined
})()

/** converts utf-16 encoded ArrayBuffer to String 
 * @function */
function ab2str(buf) {
    var chars = new Uint16Array(buf);
    var s = "";
    var l = chars.length;
    for (var i = 0; i < l; i++)
    {
        if (chars[i] == 0)
            break;
        if (chars[i] == 239)
        {
            i+=2
            continue;
        }
        s += String.fromCharCode(chars[i]);
    }
    return s;
    //return String.fromCharCode.apply(null, new Uint16Array(buf));
}



// This expects an ArrayBuffer or (Node.js) Buffer
parse = function (buffer_org) {
  /////////////////////////////////////////
  // Parse header
 
  var buf8 = new Uint8Array(buffer_org)
  var buffer = buf8.buffer // Make sure we have an ArrayBuffer
  var view = new DataView(buffer)
  if (buffer.byteLength<348) {

    throw new Error("The NIFTI buffer size was " +buffer.byteLength +". This is not even large enough to contain a header!")
  }

  if (view.getInt16(0, true) == 540 | view.getInt16(0, false) == 540 ) // nifti-2
  {
      var magic = String.fromCharCode.apply(null, buf8.subarray(4, 8))

      var littleEndian = true

      var dim = new Array(8)
      dim[0] = parseInt(view.getBigInt64(16, littleEndian))
      if (1>dim[0] || dim[0]>7) {
        littleEndian = !littleEndian
        dim[0] = parseInt(view.getBigInt64(16, littleEndian))
      }
      if (1>dim[0] || dim[0]>7) {
        console.warn("dim[0] is out-of-range, we'll simply try continuing to read the file, but this will most likely fail horribly.")
      }
      dim.length = 1+Math.min(7, dim[0])
      for(var i=1; i<dim.length; i++) {
        dim[i] = parseInt(view.getBigInt64(16+8*i, littleEndian))
        if (dim[i]<=0) {
          console.warn("dim[0] was probably wrong or corrupt")
          dim.length = i
        }
      }
      if (dim.length === 1) throw new Error("No valid dimensions!")

      var intent_p1 = view.getFloat64(80, littleEndian)
      var intent_p2 = view.getFloat64(88, littleEndian)
      var intent_p3 = view.getFloat64(98, littleEndian)
      //var intent_code = view.getInt16(68, littleEndian)

      var datatype = decodeNIfTIDataType(view.getInt16(12, littleEndian))
      var bitpix = view.getInt16(14, littleEndian)
   //   var slice_start = view.getInt16(74, littleEndian)

      var pixdim = new Array(dim.length)
      for(var i=0; i<pixdim.length; i++) {
        pixdim[i] = view.getFloat64(104+8*i, littleEndian)
      }

      var vox_offset = parseInt(view.getBigInt64(168, littleEndian))
      var scl_slope = view.getFloat32(176, littleEndian)
      var scl_inter = view.getFloat32(184, littleEndian)

      var slice_start = parseInt(view.getBigInt64(224, littleEndian))
      var slice_end = parseInt(view.getBigInt64(232, littleEndian))
      var slice_code = view.getInt32(496)

      var xyzt_units = decodeNIfTIUnits(view.getInt32(500))
      var cal_max = view.getFloat64(192, littleEndian)
      var cal_min = view.getFloat64(200, littleEndian)
      var slice_duration = view.getFloat64(208, littleEndian)
      var toffset = view.getFloat32(216, littleEndian)

      var descrip = ab2str(buf8.subarray(240, 240+80))
      var aux_file = String.fromCharCode.apply(null, buf8.subarray(320, 320+24))

      var qform_code = view.getInt32(344, littleEndian)
      var sform_code = view.getInt32(348, littleEndian)

      var quatern_b = view.getFloat64(352, littleEndian)
      var quatern_c = view.getFloat64(352+8, littleEndian)
      var quatern_d = view.getFloat64(352+8*2, littleEndian)
      var qoffset_x = view.getFloat64(352+8*3, littleEndian)
      var qoffset_y = view.getFloat64(352+8*4, littleEndian)
      var qoffset_z = view.getFloat64(352+8*5, littleEndian)

      var srow = new Float32Array(12)
      for(var i=0; i<12; i++) {
        srow[i] = view.getFloat64(400+8*i, littleEndian)
      }

      var intent_name = String.fromCharCode.apply(null, buf8.subarray(508, 508+16))
      var extension = 0;

  }
  else
  {

      // First read dim[0], to determine byte order
      var littleEndian = true
      var dim = new Array(8)
      dim[0] = view.getInt16(40, littleEndian)
      if (1>dim[0] || dim[0]>7) {
        littleEndian = !littleEndian
        dim[0] = view.getInt16(40, littleEndian)
      }
      if (1>dim[0] || dim[0]>7) {
        // Even if there were other /byte/ orders, we wouldn't be able to detect them using a short (16 bits, so only two bytes).
        console.warn("dim[0] is out-of-range, we'll simply try continuing to read the file, but this will most likely fail horribly.")
      }

      // Now check header size and magic
       var sizeof_hdr = view.getInt32(0, littleEndian)
      if (sizeof_hdr !== 348 && (1>dim[0] || dim[0]>7)) {
        // Try to recover from weird dim info
        littleEndian = !littleEndian
        dim[0] = view.getInt16(40, littleEndian)
        sizeof_hdr = view.getInt32(0, littleEndian)
        if (sizeof_hdr !== 348) {
          throw new Error("I'm sorry, but I really cannot determine the byte order of the (NIfTI) file at all.")
        }
      } else if (sizeof_hdr < 348) {
        throw new Error("Header of file is smaller than expected, I cannot deal with this.")
      } else if (sizeof_hdr !== 348) {
        console.warn("Size of NIfTI header different from what I expect, but I'll try to do my best anyway (might cause trouble).")
      }
      var magic = String.fromCharCode.apply(null, buf8.subarray(344, 348))
      if (magic !== "ni1\0" && magic !== "n+1\0") {
        throw new Error("Sorry, magic number wrong:" +  magic)
      }

      // Continue reading actual header fields
      var dim_info = view.getInt8(39)
      dim.length = 1+Math.min(7, dim[0])
      for(var i=1; i<dim.length; i++) {
        dim[i] = view.getInt16(40+2*i, littleEndian)
        if (dim[i]<=0) {
          console.warn("dim[0] was probably wrong or corrupt")
          dim.length = i
        }
      }
      if (dim.length === 1) throw new Error("No valid dimensions!")

      var intent_p1 = view.getFloat32(56, littleEndian)
      var intent_p2 = view.getFloat32(56, littleEndian)
      var intent_p3 = view.getFloat32(56, littleEndian)
      var intent_code = view.getInt16(68, littleEndian)

      var datatype = decodeNIfTIDataType(view.getInt16(70, littleEndian))
      var bitpix = view.getInt16(72, littleEndian)
      var slice_start = view.getInt16(74, littleEndian)

      var pixdim = new Array(dim.length)
      for(var i=0; i<pixdim.length; i++) {
        pixdim[i] = view.getFloat32(76+4*i, littleEndian)
      }

      var vox_offset = view.getFloat32(108, littleEndian)
      var scl_slope = view.getFloat32(112, littleEndian)
      var scl_inter = view.getFloat32(116, littleEndian)
      var slice_end = view.getInt16(120, littleEndian)
      var slice_code = view.getInt8(122)
      var xyzt_units = decodeNIfTIUnits(view.getInt8(123))
      var cal_max = view.getFloat32(124, littleEndian)
      var cal_min = view.getFloat32(128, littleEndian)
      var slice_duration = view.getFloat32(132, littleEndian)
      var toffset = view.getFloat32(136, littleEndian)

      var descrip = ab2str(buf8.subarray(148, 228))
      var aux_file = String.fromCharCode.apply(null, buf8.subarray(228, 252))

      var qform_code = view.getInt16(252, littleEndian)
      var sform_code = view.getInt16(254, littleEndian)

      var quatern_b = view.getFloat32(256, littleEndian)
      var quatern_c = view.getFloat32(260, littleEndian)
      var quatern_d = view.getFloat32(264, littleEndian)
      var qoffset_x = view.getFloat32(268, littleEndian)
      var qoffset_y = view.getFloat32(272, littleEndian)
      var qoffset_z = view.getFloat32(276, littleEndian)

      var srow = new Float32Array(12)
      var sum = 0;
      for(var i=0; i<12; i++) {
        srow[i] = view.getFloat32(280+4*i, littleEndian)
        sum+=Math.abs(srow[i])
      }
      if (sum < 0.000000001)
        sform_code = -1


      var intent_name = String.fromCharCode.apply(null, buf8.subarray(328, 344))

      var extension = view.getInt32(348, littleEndian) // Actually a different format, but this suffices for checking === zero
    
  }

  var ret = {};

  if (vox_offset > 352)
  {
      if (extension != 0) {
        var offs = 352;
        var ext = {};
        ext.size = view.getInt32(offs, littleEndian);
        ext.code = view.getInt32(offs + 4, littleEndian);
        ext.content = "";
        for (var k = 0; k < ext.size-10; k++)
        {
            var c = view.getUint8(offs + 8 + k);
            if (c != 0)
              ext.content += String.fromCharCode(c);
        }
        ret.extension = ext;
        if (ext.content.substring(0,10).search("xml")>-1)
        {
          try
          {
            ext.content = $.parseXML(ext.content);
             console.log('extended nifti header contains XML');
          }
          catch(err)
          {
            console.warn("Looks like there is a corrupt XML within the nifti header.")
          }
        }
      }
  }



  ret.sform_code = sform_code;
  ret.qform_code = qform_code;


  // Check bitpix

  // "Normalize" datatype (so that rgb/complex become several normal floats rather than compound types, possibly also do something about bits)
  // Note that there is actually both an rgb datatype and an rgb intent... (My guess is that the datatype corresponds to sizes = [3,dim[0],...], while the intent might correspond to sizes = [dim[0],...,dim[5]=3].)

  // Convert to NRRD-compatible structure
  ret.dimension = dim[0]
  ret.datatype = datatype // TODO: Check that we do not feed anything incompatible?
  ret.encoding = 'raw'
  ret.endian = littleEndian ? 'little' : 'big'
  ret.sizes = dim.slice(1) // Note that both NRRD and NIfTI use the convention that the fastest axis comes first!

  if (scl_slope == 0) scl_slope = 1;

  ret.cal_max = cal_max;
  ret.cal_min = cal_min;
  ret.scl_inter = scl_inter;
  ret.scl_slope = scl_slope;

  ret.descrip = descrip;
  ret.intent_code = intent_code;
  ret.intent_name = intent_name;


  // this is for convenience use
  ret.datascaling = 
  {
    slope:scl_slope,
    offset:scl_inter,
    id: function() {return (this.slope==1 & this.offset==0) },
    e: function(v) { return v*this.slope+this.offset },
    ie: function (v) { return (v-this.offset)/this.slope }
  };
  
  

  if (xyzt_units !== undefined) {
    ret.spaceUnits = xyzt_units
    while(ret.spaceUnits.length < ret.dimension) { // Pad if necessary
      ret.spaceUnits.push("")
    }
    ret.spaceUnits.length = ret.dimension // Shrink if necessary
  }

  ret.pixdim = pixdim;



  if (qform_code === 0) { // "method 1"
    ret.spacings = pixdim.slice(1)
    while(ret.spacings.length < ret.dimension) {
      ret.spacings.push(NaN)
    }
    ret.spaceDimension = Math.min(ret.dimension, 3) // There might be non-3D data sets? (Although the NIfTI format does seem /heavily/ reliant on assuming a 3D space.)
  } else if (qform_code > 0) { // "method 2"
    // TODO: Figure out exactly what to do with the different qform codes.
    ret.space = "right-anterior-superior" // Any method for orientation (except for "method 1") uses this, apparently.
    var qfac = pixdim[0] === 0.0 ? 1 : pixdim[0]
    var a = Math.sqrt(Math.max(0.0,1.0-(quatern_b*quatern_b+quatern_c*quatern_c+quatern_d*quatern_d)))
    var b = quatern_b
    var c = quatern_c
    var d = quatern_d
    ret.spaceDirections = [
      [pixdim[1]*(a*a+b*b-c*c-d*d),pixdim[1]*(2*b*c+2*a*d),pixdim[1]*(2*b*d-2*a*c)],
      [pixdim[2]*(2*b*c-2*a*d),pixdim[2]*(a*a+c*c-b*b-d*d),pixdim[2]*(2*c*d+2*a*b)],
      [qfac*pixdim[3]*(2*b*d+2*a*c),qfac*pixdim[3]*(2*c*d-2*a*b),qfac*pixdim[3]*(a*a+d*d-c*c-b*b)]]
    ret.spaceOrigin = [qoffset_x,qoffset_y,qoffset_z]
    ret.form = 'qform';
  } else {
    console.warn("Invalid qform_code: " + qform_code + ", orientation is probably messed up.")
  }
  // TODO: Here we run into trouble, because in NRRD we cannot expose two DIFFERENT (not complementary, different!) transformations. Even more frustrating is that sform transformations are actually more compatible with NRRD than the qform methods.
  //console.warn("sform " + sform_code);
    // RGB niftis from dcm2nii have sform_code 0, but still have the srow ... so this should always be tried ...? 

  var prefq = false;
  if (typeof ViewerSettings != "undefined" && ViewerSettings != undefined && ViewerSettings.preferqform != undefined)
     prefq = ViewerSettings.preferqform;

  if (qform_code == 0 && prefq)
  {
      prefq = false;
      console.warn("qform prefered, but qform_code=0, switching back to sform")      
  }
  prefq = prefq & qform_code!=0;


  if ((sform_code != 0 && !prefq) || ret.spaceDirections == undefined)
  { // "method 3"
    ret.space = "right-anterior-superior" // Any method for orientation (except for "method 1") uses this, apparently.
    ret.form = 'sform';
    
    // Nifit format convention is: row-wise storage of matric (x,x,x offsx,   y,y,y, offsy, z,z,z,offsz)
    // Therefore, must transpose for column wise storage.
    // However, in javascipt array multiplicaton assums row-wise storage. Therefore, edges are created as transposed in MedImageViewer prepare data
    ret.spaceDirections = [
      [srow[0*4 + 0],srow[1*4 + 0],srow[2*4 + 0]],
      [srow[0*4 + 1],srow[1*4 + 1],srow[2*4 + 1]],
      [srow[0*4 + 2],srow[1*4 + 2],srow[2*4 + 2]]]
    ret.spaceOrigin = [srow[0*4 + 3],srow[1*4 + 3],srow[2*4 + 3]]
    //print_matrix(ret.spaceDirections);
  }



  if (magic === "n+2\0") { // nifti2
    ret.hdroffset = Math.floor(vox_offset);
    ret.buffer = buffer;
    if (datatype !== 0) {
      ret.data = parseNIfTIRawData(ret.buffer, datatype, dim, {endianFlag: littleEndian},Math.floor(vox_offset))
    }
  }
  else
  if (magic === "n+1\0") { // nifti1 analysze75
    ret.hdroffset = Math.floor(vox_offset);
    ret.buffer = buffer;
    if (datatype !== 0) {
      // TODO: It MIGHT make sense to equate DT_UNKNOWN (0) to 'block', with bitpix giving the block size in bits
      ret.data = parseNIfTIRawData(ret.buffer, datatype, dim, {endianFlag: littleEndian},Math.floor(vox_offset))
    }
  }

  ret.filetype='nifti';


  return ret
}

/****************************************************************
* transform the nifti coordinate system in BUFFER directly
*  currently unused function, went to prepareMedicalImageData
*****************************************************************/
function transform_nifti(buffer_org, coregmat)
{


    var buffer = (new Uint8Array(buffer_org)).buffer

    var littleEndian = true;

    var view = new DataView(buffer)
    var srow = new Float32Array(12)
    
    for(var i=0; i<12; i++) 
    {
      srow[i] = view.getFloat32(280+4*i, littleEndian)
    }
    
    // extract affine matrix and apply transform
    var edges = 
    [
      [srow[0*4 + 0],srow[1*4 + 0],srow[2*4 + 0], 0],
      [srow[0*4 + 1],srow[1*4 + 1],srow[2*4 + 1], 0],
      [srow[0*4 + 2],srow[1*4 + 2],srow[2*4 + 2], 0],
      [srow[0*4 + 3],srow[1*4 + 3],srow[2*4 + 3], 1]
    ]

    edges = math.transpose(edges);
    edges = math.multiply(math.matrix(coregmat), edges );
 
    // write back to buffer
    var k=0;
    for(var i=0; i<3; i++) 
    {
      for(var j=0; j<4; j++) 
      {
        val = edges._data[i][j];
        // verify
        //console.log(srow[k].toFixed(2) + "  " + val.toFixed(2));
        view.setFloat32(280+4*k, val, littleEndian)
        k++;
      }
    }
    return buffer;
}






function parseNIfTIRawData(buffer, type, dim, options,hdroffs) {
  var i, arr, view, totalLen = 1, endianFlag = options.endianFlag, endianness = endianFlag ? 'little' : 'big'
  for(i=1; i<dim.length; i++) {
    totalLen *= dim[i]
  }
  if (type == 'block') {
    // Don't do anything special, just return the slice containing all blocks.
    return buffer.slice(hdroffs,totalLen*options.blockSize)
  } else if (type == 'int8' || type == 'uint8' || endianness == systemEndianness) {
    switch(type) {
    case "int8":
      checkSize(1)
      return new Int8Array(buffer,hdroffs);
    case "uint8":
      checkSize(1)
      return new Uint8Array(buffer,hdroffs);
    case "int16":
      checkSize(2)
      return new Int16Array(buffer,hdroffs);
    case "uint16":
      checkSize(2)
      if (totalLen > buffer.byteLength)
        return new Uint16Array(buffer,hdroffs);
      else
        return new Uint16Array(buffer,hdroffs,totalLen);
    case "int32":
      checkSize(4)
      return new Int32Array(buffer,hdroffs);
    case "uint32":
      checkSize(4)
      return new Uint32Array(buffer,hdroffs);
    //case "int64":
    //  checkSize(8)
    //  return new Int64Array(buffer.slice(0,totalLen*8))
    //case "uint64":
    //  checkSize(8)
    //  return new Uint64Array(buffer.slice(0,totalLen*8))
    case "float":
      checkSize(4)
      return new Float32Array(buffer,hdroffs);
    case "double":
      checkSize(8)
      return new Float64Array(buffer,hdroffs);
    case "rgb24":
      return new Uint8Array(buffer,hdroffs);
    default:
      console.warn("Unsupported NIfTI type: " + type)
      return undefined
    }
  } else {
    view = new DataView(buffer)
    switch(type) {
    case "int8": // Note that here we do not need to check the size of the buffer, as the DataView.get methods should throw an exception if we read beyond the buffer.
      arr = new Int8Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getInt8(hdroffs + i)
      }
      return arr
    case "uint8":
      arr = new Uint8Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getUint8(hdroffs + i)
      }
      return arr
    case "int16":
      arr = new Int16Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getInt16(hdroffs + i*2)
      }
      return arr
    case "uint16":
      arr = new Uint16Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getUint16(hdroffs + i*2)
      }
      return arr
    case "int32":
      arr = new Int32Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getInt32(hdroffs + i*4)
      }
      return arr
    case "uint32":
      arr = new Uint32Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getUint32(hdroffs + i*4)
      }
      return arr
    //case "int64":
    //  arr = new Int64Array(totalLen)
    //  for(i=0; i<totalLen; i++) {
    //    arr[i] = view.getInt64(i*8)
    //  }
    // return arr
    //case "uint64":
    //  arr = new Uint64Array(totalLen)
    //  for(i=0; i<totalLen; i++) {
    //    arr[i] = view.getUint64(i*8)
    //  }
    //  return arr
    case "float":
      arr = new Float32Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getFloat32(hdroffs+i*4)
      }
      return arr
    case "double":
      arr = new Float64Array(totalLen)
      for(i=0; i<totalLen; i++) {
        arr[i] = view.getFloat64(hdroffs+i*8)
      }
      return arr
    default:
      console.warn("Unsupported NRRD type: " + type)
      return undefined
    }
  }
  function checkSize(sizeOfType) 
  {
    if (buffer.byteLength<totalLen*sizeOfType) 
      //throw new Error("NIfTI file does not contain enough data!")
      console.log("NIfTI file does not contain enough data!");
  }
}






function decodeNIfTIDataType(datatype) {
  switch(datatype) {
  case 1:
    return 'bit'
  case 2:
    return 'uint8'
  case 4:
    return 'int16'
  case 8:
    return 'int32'
  case 16:
    return 'float'
  case 32:
    return 'complex64'
  case 64:
    return 'double'
  case 128:
    return 'rgb24'
  case 256:
    return 'int8'
  case 512:
    return 'uint16'
  case 768:
    return 'uint32'
  case 1024:
    return 'int64'
  case 1280:
    return 'uint64'
  case 1536:
    return 'float128'
  case 1792:
    return 'complex128'
  case 2048:
    return 'complex256'
  case 2304:
    return 'rgba32'
  default:
    console.warn("Unrecognized NIfTI data type: " + datatype)
    return datatype
  }
}

function decodeNIfTIUnits(units) {
  var space, time
  switch(units & 7) {
  case 0:
    space = ""
    break
  case 1:
    space = "m"
    break
  case 2:
    space = "mm"
    break
  case 3:
    space = "um"
    break
  default:
    console.warn("Unrecognized NIfTI unit: " + (units&7))
    space = ""
  }
  switch(units & 56) {
  case 0:
    time = ""
    break
  case 8:
    time = "s"
    break
  case 16:
    time = "ms"
    break
  case 24:
    time = "us"
    break
  case 32:
    time = "Hz"
    break
  case 40:
    time = "ppm"
    break
  case 48:
    time = "rad/s"
    break
  default:
    console.warn("Unrecognized NIfTI unit: " + (units&56))
    time = ""
  }
  return (space === "" && time === "") ? undefined : [space, space, space, time]
}




/** parses a mgh imaging file (freesurfer)
 * @param {ArrayBuffer} buffer - the binary to be parsed
 * @return {nifti} the nifti object
 */
function parse_mgh(buffer)
{

    var view = new DataView(buffer);
    var nifti = {
        filetype: 'mgh'
    };

    nifti.sizes = [view.getInt32(4), view.getInt32(8), view.getInt32(12), view.getInt32(16)];
    nifti.type = ({
        "0": "UCHAR",
        "4": "SHORT",
        "1": "INT",
        "3": "FLOAT"
    })[view.getInt32(20)];

    var i = 42;
    nifti.voxSize = [view.getFloat32(30), view.getFloat32(34), view.getFloat32(38)];
    var d = nifti.voxSize;
    nifti.spaceDirections = [[view.getFloat32(i) * d[0], view.getFloat32(i + 4) * d[0], view.getFloat32(i + 8) * d[0]],
    [view.getFloat32(i + 12) * d[1], view.getFloat32(i + 16) * d[1], view.getFloat32(i + 20) * d[1]],
    [view.getFloat32(i + 24) * d[2], view.getFloat32(i + 28) * d[2], view.getFloat32(i + 32) * d[2]]];
    var M = nifti.spaceDirections;
    nifti.spaceOrigin = [
    view.getFloat32(i + 36) - (M[0][0] * nifti.sizes[0] + M[1][0] * nifti.sizes[1] + M[2][0] * nifti.sizes[2]) / 2,
    view.getFloat32(i + 40) - (M[0][1] * nifti.sizes[0] + M[1][1] * nifti.sizes[1] + M[2][1] * nifti.sizes[2]) / 2,
    view.getFloat32(i + 44) - (M[0][2] * nifti.sizes[0] + M[1][2] * nifti.sizes[1] + M[2][2] * nifti.sizes[2]) / 2];



    nifti.buffer = buffer;

    //xxx = nifti
    //xxx.spaceOrigin = [-30, -30, 13]
    var hdroffs = 284;
    var imgsiz = nifti.sizes[0] * nifti.sizes[1] * nifti.sizes[2] * nifti.sizes[3];





    nifti.nbyte = 1;
    var view = new DataView(buffer,hdroffs);


    if (nifti.type == 'UCHAR')
    {
        nifti.nbyte = 1;
        nifti.data = new Uint8Array(buffer,hdroffs,imgsiz);
        for (var k = 0; k < imgsiz; k++)
            nifti.data[k] = view.getUint8(k * nifti.nbyte);
    }
    else if (nifti.type == 'SHORT')
    {
        nifti.nbyte = 2;
        nifti.data = new Uint16Array(buffer,hdroffs,imgsiz);
        for (var k = 0; k < imgsiz; k++)
            nifti.data[k] = view.getUint16(k * nifti.nbyte);
    }
    else if (nifti.type == 'INT')
    {
        nifti.nbyte = 4;
        nifti.data = new Int32Array(buffer,hdroffs,imgsiz);
        for (var k = 0; k < imgsiz; k++)
            nifti.data[k] = view.getInt32(k * nifti.nbyte);
    }
    else if (nifti.type == 'FLOAT')
    {
        nifti.nbyte = 4;
        nifti.data = new Float32Array(buffer,hdroffs,imgsiz);
        for (var k = 0; k < imgsiz; k++)
            nifti.data[k] = view.getFloat32(k * nifti.nbyte);
    }

    nifti.mgh_extension = ab2str(new Uint8Array(buffer,hdroffs + imgsiz * nifti.nbyte));

    var scl_slope = 1;
    var scl_inter = 0;

    nifti.datascaling = {
        slope: scl_slope,
        offset: scl_inter,
        id: function() {
            return ( scl_slope == 1 & scl_inter == 0)
        },
        e: function(v) {
            return v * scl_slope + scl_inter
        },
        ie: function(v) {
            return (v - scl_inter) / scl_slope
        }
    };

    nifti.pixdim = [nifti.sizes.length]
    nifti.pixdim = nifti.pixdim.concat(nifti.sizes);



    return nifti;



}






function NRRD()
{
   var nrrd = {};


var lineSeparatorRE = /[ \f\t\v]*\r?\n/;
var NRRDMagicRE = /^NRRD\d{4}$/;
var lineRE = /^([^:]*)(:[ =])(.*)$/;
var dataFileListRE = /^LIST(?: (\d+))?$/;

// The minimal object this accepts is formed like this:
//   {data: SomeTypedArray, sizes: [...]}
// On the other hand, if data is not given it must have a form like this:
//   {buffer: SomeArrayBuffer, type: ..., endian: ..., sizes: [...]}
// Of course, if 'type' is an 8-bit type, endian is not needed, and if 'type' equals 'block', 'blockSize' should be set instead of 'endian'. In this case, no interpretation of buffer is done (at all, it is written serialized directly to the buffer).
// TODO: For now this only supports serializing "inline" files, or files for which you have already prepared the data.
nrrd.serialize = function (nrrdOrg) {
    var i, buffer, arr, totalLen = 1, nrrd = {}, prop, nativeType, nativeSize, bufferData, arrData, line, lines = [], header;
    
    // Copy nrrdOrg to nrrd to allow modifications without altering the original
    for(prop in nrrdOrg) {
        nrrd[prop] = nrrdOrg[prop];
    }
    
    // For saving files we allow inferring certain information if it is not explicitly given.
    // Also we normalize some fields to make our own lives easier.
    if (nrrd.sizes===undefined) { // 'sizes' should ALWAYS be given
        throw new Error("Sizes missing from NRRD file!");
    } else if (nrrd.dimension===undefined) {
        nrrd.dimension = nrrd.sizes.length;
    }
    if (nrrd.data instanceof Int8Array) {
        nativeType = "int8";
    } else if (nrrd.data instanceof Uint8Array) {
        nativeType = "uint8";
    } else if (nrrd.data instanceof Int16Array) {
        nativeType = "int16";
    } else if (nrrd.data instanceof Uint16Array) {
        nativeType = "uint16";
    } else if (nrrd.data instanceof Int32Array) {
        nativeType = "int32";
    } else if (nrrd.data instanceof Uint32Array) {
        nativeType = "uint32";
    //} else if (nrrd.data instanceof Int64Array) {
    //    nativeType = "int64";
    //} else if (nrrd.data instanceof Uint64Array) {
    //    nativeType = "uint64";
    } else if (nrrd.data instanceof Float32Array) {
        nativeType = "float";
    } else if (nrrd.data instanceof Float64Array) {
        nativeType = "double";
    }
    if (nrrd.type===undefined && nativeType!==undefined) {
        nrrd.type = nativeType;
    } else if (nrrd.type===undefined) {
        throw new Error("Type of data is not given and cannot be inferred!");
    } else if ((typeof nrrd.type) == "string" || nrrd.type instanceof String) {
        nrrd.type = parseNRRDType(nrrd.type);
    }
    if (nrrd.encoding===undefined) {
        nrrd.encoding = "raw";
    } else if ((typeof nrrd.encoding) == "string" || nrrd.encoding instanceof String) {
        nrrd.encoding = parseNRRDEncoding(nrrd.encoding);
    }
    if (nrrd.data && nrrd.type != 'block' && nrrd.type != 'int8' && nrrd.type != 'uint8' && nrrd.encoding != 'ascii') {
        nrrd.endian = systemEndianness;
    } else if (nrrd.type == 'block' || nrrd.type == 'int8' || nrrd.type == 'uint8' || nrrd.encoding == 'ascii') {
        nrrd.endian = undefined;
    } else if ((typeof nrrd.endian) == "string" || nrrd.endian instanceof String) {
        nrrd.endian = parseNRRDEndian(nrrd.endian);
    }
    
    // Try to infer spatial dimension
    var spaceDimension = undefined;
    if (nrrd.spaceDimension!==undefined) {
        spaceDimension = nrrd.spaceDimension;
    } else if (nrrd.space!==undefined) {
        switch(nrrd.space) {
        case "right-anterior-superior":
        case "RAS":
            spaceDimension = 3;
            break;
        case "left-anterior-superior":
        case "LAS":
            spaceDimension = 3;
            break;
        case "left-posterior-superior":
        case "LPS":
            spaceDimension = 3;
            break;
     	  case "right-anterior-superior-time":
     	  case "RAST":
     	      spaceDimension = 4;
     	      break;
        case "left-anterior-superior-time":
        case "LAST":
            spaceDimension = 4;
            break;
        case "left-posterior-superior-time":
        case "LPST":
            spaceDimension = 4;
            break;
        case "scanner-xyz":
            spaceDimension = 3;
            break;
        case "scanner-xyz-time":
            spaceDimension = 4;
            break;
        case "3D-right-handed":
            spaceDimension = 3;
            break;
        case "3D-left-handed":
            spaceDimension = 3;
            break;
        case "3D-right-handed-time":
            spaceDimension = 4;
            break;
        case "3D-left-handed-time":
            spaceDimension = 4;
            break;
        default:
            console.warn("Unrecognized space: " + nrrd.space);
        }
    }
    
    // Now check that we have a valid nrrd structure.
    checkNRRD(nrrd);

    // Determine number of elements and check that we have enough data (if possible)
    for(i=0; i<nrrd.sizes.length; i++) {
        if (nrrd.sizes[i]<=0) throw new Error("Sizes should be a list of positive (>0) integers!");
        totalLen *= nrrd.sizes[i];
    }
    if (nrrd.data) {
        if (nrrd.data.length < totalLen) {
            throw new Error("Missing data to serialize!");
        }
    } else if (nrrd.buffer) {
        if (nrrd.encoding == "raw") {
            if (nrrd.type=="block" && nrrd.blockSize!==undefined) {
                nativeSize = nrrd.blockSize;
            } else {
                nativeSize = getNRRDTypeSize(nrrd.type);
            }
            if (nrrd.buffer.byteLength < totalLen*nativeSize) {
                throw new Error("Missing data to serialize!");
            }
        }
    } else if (nrrd.dataFile) {
        // Okay, if you have your data ready, we'll just write a header.
    } else {
        throw new Error("Will not serialize an empty NRRD file!");
    }
    
    // Make sure we have the correct buffer in bufferData.
    if (nrrd.data) {
        switch(nrrd.encoding) {
        case 'raw':
            if (nrrd.type == nativeType && nrrd.endian == systemEndianness) {
                bufferData = nrrd.data.buffer.slice(nrrd.data.byteOffset, nrrd.data.byteOffset+nrrd.data.byteLength);
            } else if (nrrd.endian == systemEndianness) {
                bufferData = castTypedArray(nrrd.data, nrrd.type);
                bufferData = bufferData.buffer.slice(bufferData.byteOffset, bufferData.byteOffset+bufferData.byteLength);
            } else {
                bufferData = serializeToBuffer(nrrd.data, nrrd.type, nrrd.endian);
            }
            break;
        case 'ascii':
            if (nrrd.type == nativeType) {
                bufferData = serializeToTextBuffer(nrrd.data);
            } else {
                bufferData = serializeToTextBuffer(castTypedArray(nrrd.data, nrrd.type));
            }
            break;
        default:
            throw new Error("Unsupported NRRD encoding: " + nrrd.encoding);
        }
    } else if (nrrd.buffer) {
        bufferData = nrrd.buffer;
    }
    
    // Start header
    lines.push("NRRD0005"); // TODO: Adjust version based on features that are actually used and/or the version specified by the user (if any).
    lines.push("# Generated by nrrd-js");
    
    // Put in dimension and space dimension (the NRRD spec requires that these are present before any lists whose length depends on them)
    var firstProps = ['dimension', 'spaceDimension', 'space'];
    for(i=0; i<firstProps.length; i++) {
        prop = firstProps[i];
        if (nrrd[prop] === undefined) continue; // Skip things we explicitly set to undefined.
        line = serializeField(prop, nrrd[prop], nrrd.dimension, spaceDimension);
        if (line!==undefined) lines.push(line);
    }
    
    // Put in field specifications
    for(prop in nrrd) {
        if (nrrd[prop] === undefined) continue; // Skip things we explicitly set to undefined.
        if (firstProps.indexOf(prop)>=0) continue; // Skip the fields we already output.
        line = serializeField(prop, nrrd[prop], nrrd.dimension, spaceDimension);
        if (line!==undefined) lines.push(line);
    }
    
    // Put in keys (if any)
    if (nrrd.keys) for(prop in nrrd.keys) {
        if (prop.indexOf(":=")>=0) throw new Error("The combination ':=' is not allowed in an NRRD key!");
        lines.push(prop + ":=" + escapeValue(nrrd[prop]));
    }
    
    // Put in data file list (if any)
    if (nrrd.dataFile && nrrd.dataFile.length) {
        lines.push("data file: LIST");
        Array.prototype.push.apply(lines, nrrd.dataFile);
    } else if (nrrd.dataFile && nrrd.dataFile.files && 'subdim' in nrrd.dataFile) {
        lines.push("data file: LIST " + nrrd.dataFile.subdim);
        Array.prototype.push.apply(lines, nrrd.dataFile.files);
    }
    
    // Put in empty line and inline data (if we have inline data) and convert lines to buffer
    if (bufferData && !('dataFile' in nrrd)) {
        lines.push("");
        lines.push(""); // We actually need an extra blank line to make sure the previous is terminated.
        header = lines.join("\n");
        buffer = new ArrayBuffer(header.length + bufferData.byteLength);
        arr = new Uint8Array(buffer);
        for(i=0; i<header.length; i++) {
            arr[i] = header.charCodeAt(i);
        }
        arrData = new Uint8Array(bufferData);
        arr.set(arrData, header.length);
    } else {
        lines.push(""); // Blank line to at least terminate the last line.
        header = lines.join("\n");
        buffer = new ArrayBuffer(header.length);
        arr = new Uint8Array(buffer);
        for(i=0; i<header.length; i++) {
            arr[i] = header.charCodeAt(i);
        }
    }
    
    return buffer;
};

// This expects an ArrayBuffer.
nrrd.parse = function (buffer) {
    var i, header, dataStart, ret = {data: undefined/* parsed data */, buffer: undefined/* raw buffer holding data */, keys: {}, version: undefined},
        lines, match, match2,
        buf8 = new Uint8Array(buffer);

    // A work-around for incompatibilities between Node's Buffer and ArrayBuffer.
    if (buf8.buffer !== buffer) buffer = buf8.buffer;

    // First find the separation between the header and the data (if there is one)
    // Note that we need to deal with with LF and CRLF as possible line endings.
    // Luckily this means the line always ends with LF, so we only need to consider
    // LFLF and LFCRLF as patterns for the separating empty line.
    i=2; // It is safe to start at position 2 (in fact, we could start even later), as the file HAS to start with a magic word.
    while(i<buf8.length) {
        if (buf8[i] == 10) { // We hit an LF
            if (buf8[i-1] == 10 || (buf8[i-1] == 13 && buf8[i-2] == 10)) { // Safe because we start at position 2 and never move backwards
                dataStart = i+1;
                break;
            } else {
                i++; // Move forward just once
            }
        } else if (buf8[i] == 13) { // We hit a CR
            i++; // Move forward just once
        } else {
            i += 2; // Move forward two places, 
        }
    }
    
    // Now split up the header and data
    if (dataStart === undefined) {
        header = String.fromCharCode.apply(null, buf8);
    } else {
        header = String.fromCharCode.apply(null, buf8.subarray(0,dataStart));
        ret.buffer = buffer.slice(dataStart);
    }
    
    // Split header into lines, remove comments (and blank lines) and check magic.
    // All remaining lines except the first should be field specifications or key/value pairs.
    // TODO: This explicitly removes any whitespace at the end of lines, however, I am not sure that this is actually desired behaviour for all kinds of lines.
    lines = header.split(lineSeparatorRE);
    lines = lines.filter(function (l) { return l.length>0 && l[0] != '#'; }); // Remove comment lines
    if (!NRRDMagicRE.test(lines[0])) {
        throw new Error("File is not an NRRD file!");
    }
    ret.version = parseInt(lines[0].substring(4, 8), 10);
    if (ret.version>5) {
        console.warn("Reading an unsupported version of the NRRD format; things may go haywire.");
    }

    // Parse lines
    for(i=1; i<lines.length; i++) {
        match = lineRE.exec(lines[i]);
        if (!match) {
            console.warn("Unrecognized line in NRRD header: " + lines[i]);
            continue;
        }
        if (match[2] == ': ') { // Field specification
            match[1] = mapNRRDToJavascript(match[1]);
            if ( match[1] == 'dataFile' &&
                 (match2 = dataFileListRE.exec(match[3]))) {
                // This should be the last field specification,
                // and the rest of the lines should contain file names.
                if (match2.length == 2 && match2[1]) { // subdim specification
                    ret[match[1]] = {
                        files: lines.slice(i+1),
                        subdim: parseNRRDInteger(match2[1])
                    };
                } else {
                    ret[match[1]] = lines.slice(i+1);
                }
                lines.length = i;
            } else {
                ret[match[1]] = parseField(match[1], match[3]);
            }
        } else if (match[2] == ':=') { // Key/value pair
            ret.keys[match[1]] = unescapeValue(match[3]);
        } else {
            throw new Error("Logic error in NRRD parser."); // This should never happen (unless the NRRD syntax is extended and the regexp is updated, but this section is not, or some other programmer error).
        }
    }

    // Make sure the file satisfies the requirements of the NRRD format
    checkNRRD(ret);
   

    // where to get this from???
    ret.datascaling = 
    {
      slope:1,
      offset:0,
      id: function() {return (this.slope==1 & this.offset==0) },
      e: function(v) { return v*this.slope+this.offset },
      ie: function (v) { return (v-this.offset)/this.slope }
    };

    if (ret.space == "left-posterior-superior")
      ret; 


    ret.datatype = ret.type;
    ret.filetype = "nrrd"
    
    ret.pixdim = [ret.sizes.length]
    ret.pixdim = ret.pixdim.concat(ret.sizes);

    // "Parse" data
    if ('dataFile' in ret) {
        console.warn("No support for external data yet!");
    } else {
        switch(ret.encoding) {
        case 'raw':
            ret.data = parseNRRDRawData(ret.buffer, ret.type, ret.sizes, {
                endian: ret.endian, blockSize: ret.blockSize
            });
            break;
        case 'ascii':
            ret.data = parseNRRDTextData(ret.buffer, ret.type, ret.sizes);
            break;
        case 'gzip':
            var buf = pako.inflate(ret.buffer)
             ret.data = parseNRRDRawData(buf.buffer, ret.type,ret.sizes, {
                endian: ret.endian, blockSize: ret.blockSize
            });
            break;
        default:
            console.warn("Unsupported NRRD encoding: " + ret.encoding);
        }
    }
    
    return ret;
};

function escapeValue(val) {
    return val.replace('\\', '\\\\').replace('\n', '\\n');
}

function unescapeValue(val) {
    return val.split('\\\\').map(
        function(s) { return s.replace('\\n', '\n'); }
        ).join('\\');
}

// Serializes NRRD fields
function serializeField(prop, value, dimension, spaceDimension) {
    var line;
    var propNRRD = mapJavascriptToNRRD(prop);
    switch(prop) {
    // nrrd-js stuff: skip
    case 'data':
    case 'buffer':
    case 'keys':
    case 'version':
        break;
    // Literal (uninterpreted) fields
    case 'content':
    case 'number':
    case 'sampleUnits':
    case 'space':
        line = propNRRD + ": " + value;
        break;
    // Integers (no infinity or whatever, just a plain integer, so the default serialization is good enough)
    case 'blockSize':
    case 'lineSkip':
    case 'byteSkip':
    case 'dimension':
    case 'spaceDimension':
        assert((typeof value) == "number" || value instanceof Number, "Field " + prop + " should at least contain a number!");
        line = propNRRD + ": " + value;
        break;
    // Floats (default serialization is good enough, as NaN contains nan, ignoring case, and similarly for Infinity inf)
    case 'min':
    case 'max':
    case 'oldMin':
    case 'oldMax':
        assert((typeof value) == "number" || value instanceof Number, "Field " + prop + " should contain a number!");
        line = propNRRD + ": " + value;
        break;
    // Vectors
    case 'spaceOrigin':
        assert(value.length === spaceDimension, "Field " + prop + " should be a list with length equal to the space dimension!");
        value.forEach(function (val) { assert((typeof val) == "number" || val instanceof Number, "Field " + prop + " should be a list of numbers!"); });
        line = propNRRD + ": (" + value.join(",") + ")";
        break;
    // Lists of strings
    case 'labels':
    case 'units':
    case 'spaceUnits':
        assert(value.length !== undefined && value.length == dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        value.forEach(function (val) { assert((typeof val) == "string" || val instanceof String, "Field " + prop + " should be a list of numbers!"); });
        line = propNRRD + ": " + value.map(serializeNRRDQuotedString).join(" ");
        break;
    // Lists of integers
    case 'sizes':
        assert(value.length !== undefined && value.length == dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        value.forEach(function (val) { assert((typeof val) == "number" || val instanceof Number, "Field " + prop + " should be a list of numbers!"); });
        line = propNRRD + ": " + value.join(" ");
        break;
    // Lists of floats
    case 'spacings':
    case 'thicknesses':
    case 'axisMins':
    case 'axisMaxs':
        assert(value.length !== undefined && value.length == dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        value.forEach(function (val) { assert((typeof val) == "number" || val instanceof Number, "Field " + prop + " should be a list of numbers!"); });
        line = propNRRD + ": " + value.join(" ");
        break;
    // Lists of vectors (dimension sized)
    case 'spaceDirections':
        assert(value.length !== undefined && value.length === dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        value.forEach(function (vec) {
          assert(vec === null || (vec.length !== undefined && vec.length === spaceDimension), "The elements of field " + prop + " should be lists with length equal to the space dimension!");
          if (vec !== null) vec.forEach(function (val) { assert((typeof val) == "number" || val instanceof Number, "The elements of field " + prop + " should be lists of numbers!"); });
        });
        line = propNRRD + ": " + value.map(function(vec) { return vec === null ? "none" : ("(" + vec.join(",") + ")"); }).join(" ");
        break;
    // Lists of vectors (space dimension sized)
    case 'measurementFrame':
        assert(value.length !== undefined && value.length === spaceDimension, "Field " + prop + " should be a list with length equal to the space dimension!");
        value.forEach(function (vec) {
          assert(vec === null || (vec.length !== undefined && vec.length === spaceDimension), "The elements of field " + prop + " should be lists with length equal to the space dimension!");
          if (vec !== null) vec.forEach(function (val) { assert((typeof val) == "number" || val instanceof Number, "The elements of field " + prop + " should be lists of numbers!"); });
        });
        line = propNRRD + ": " + value.map(function(vec) { return vec === null ? "none" : ("(" + vec.join(",") + ")"); }).join(" ");
        break;
    // One-of-a-kind fields
    case 'type':
        assert((typeof value) == "string" || value instanceof String, "Field " + prop + " should contain a string!");
        line = propNRRD + ": " + value;
        break;
    case 'encoding':
        assert((typeof value) == "string" || value instanceof String, "Field " + prop + " should contain a string!");
        line = propNRRD + ": " + value;
        break;
    case 'endian':
        assert((typeof value) == "string" || value instanceof String, "Field " + prop + " should contain a string!");
        line = propNRRD + ": " + value;
        break;
    case 'dataFile':
        if (value.length || (value.files && 'subdim' in value)) {
            // List of data files: skip for now
        } else {
            line = propNRRD + ": " + serializeNRRDDataFile(value);
        }
        break;
    case 'centers':
        assert(value.length !== undefined && value.length == dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        line = propNRRD + ": " + value.map(serializeNRRDOptional).join(" ");
        break;
    case 'kinds':
        assert(value.length !== undefined && value.length == dimension, "Field " + prop + " should be a list with length equal to the dimension!");
        line = propNRRD + ": " + value.map(serializeNRRDOptional).join(" ");
        break;
    // Something unknown
    default:
        console.warn("Unrecognized NRRD field: " + prop + ", skipping.");
    }
    return line;
}

// Parses and normalizes NRRD fields, assumes the field names are already lower case.
function parseField(identifier, descriptor) {
    switch(identifier) {
    // Literal (uninterpreted) fields
    case 'content':
    case 'number':
    case 'sampleUnits':
        break;
    // Integers
    case 'dimension':
    case 'blockSize':
    case 'lineSkip':
    case 'byteSkip':
    case 'spaceDimension':
        descriptor = parseNRRDInteger(descriptor);
        break;
    // Floats
    case 'min':
    case 'max':
    case 'oldMin':
    case 'oldMax':
        descriptor = parseNRRDFloat(descriptor);
        break;
    // Vectors
    case 'spaceOrigin':
        descriptor = parseNRRDVector(descriptor);
        break;
    // Lists of strings
    case 'labels':
    case 'units':
    case 'spaceUnits':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDQuotedString);
        break;
    // Lists of integers
    case 'sizes':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDInteger);
        break;
    // Lists of floats
    case 'spacings':
    case 'thicknesses':
    case 'axisMins':
    case 'axisMaxs':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDFloat);
        break;
    // Lists of vectors
    case 'spaceDirections':
    case 'measurementFrame':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDVector);
        break;
    // One-of-a-kind fields
    case 'type':
        descriptor = parseNRRDType(descriptor);
        break;
    case 'encoding':
        descriptor = parseNRRDEncoding(descriptor);
        break;
    case 'endian':
        descriptor = parseNRRDEndian(descriptor);
        break;
    case 'dataFile':
        descriptor = parseNRRDDataFile(descriptor);
        break;
    case 'centers':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDCenter);
        break;
    case 'kinds':
        descriptor = parseNRRDWhitespaceSeparatedList(descriptor, parseNRRDKind);
        break;
    case 'space':
        descriptor = parseNRRDSpace(descriptor);
        break;
    // Something unknown
    default:
        console.warn("Unrecognized NRRD field: " + identifier);
    }
    return descriptor;
}

// This only includes names whose lower case form is different from the Javascript form.
var mapNRRDToJavascriptStatic = {
    'block size': 'blockSize',
    'blocksize': 'blockSize',
    'old min': 'oldMin',
    'oldmin': 'oldMin',
    'old max': 'oldMax',
    'oldmax': 'oldMax',
    'data file': 'dataFile',
    'datafile': 'dataFile',
    'line skip': 'lineSkip',
    'lineskip': 'lineSkip',
    'byte skip': 'byteSkip',
    'byteskip': 'byteSkip',
    'sample units': 'sampleUnits',
    'sampleunits': 'sampleUnits',
    'axis mins': 'axisMins',
    'axis maxs': 'axisMaxs',
    'centers': 'centers', // Not different, just included so it is clear why centerings maps to centers
    'centerings': 'centers',
    'space dimension': 'spaceDimension',
    'space units': 'spaceUnits',
    'space origin': 'spaceOrigin',
    'space directions': 'spaceDirections',
    'measurement frame': 'measurementFrame'
};
var mapJavascriptToNRRDStatic = function() {
  var id, m = {};
  for(id in mapNRRDToJavascriptStatic) {
    m[mapNRRDToJavascriptStatic[id]] = id;
  }
  return m;
}();
function mapNRRDToJavascript(id) {
    // In any case, use the lower case version of the id
    id = id.toLowerCase();
    // Filter out any fields for which we have an explicit Javascript name
    if (id in mapNRRDToJavascriptStatic) return mapNRRDToJavascriptStatic[id];
    // Otherwise, just return the (lower case) id
    return id;
}
function mapJavascriptToNRRD(id) {
    // Filter out any fields for which we have an explicit NRRD name
    if (id in mapJavascriptToNRRDStatic) return mapJavascriptToNRRDStatic[id];
    // Otherwise, just return the id
    return id;
}

function parseNRRDInteger(str) {
    var val = parseInt(str, 10);
    if (Number.isNaN(val)) throw new Error("Malformed NRRD integer: " + str);
    return val;
}

function parseNRRDFloat(str) {
    str = str.toLowerCase();
    if (str.indexOf('nan')>=0) return NaN;
    if (str.indexOf('-inf')>=0) return -Infinity;
    if (str.indexOf('inf')>=0) return Infinity;
    var val = parseFloat(str);
    if (Number.isNaN(val)) throw new Error("Malformed NRRD float: " + str);
    return val;
}

function parseNRRDVector(str) {
    if (str == "none") return null;
    if (str.length<2 || str[0]!=="(" || str[str.length-1]!==")") throw new Error("Malformed NRRD vector: " + str);
    return str.slice(1, -1).split(",").map(parseNRRDFloat);
}

function parseNRRDQuotedString(str) {
    if (length<2 || str[0]!='"' || str[str.length-1]!='"') {
        throw new Error("Invalid NRRD quoted string: " + str);
    }
    return str.slice(1, -1).replace('\\"', '"');
}

function serializeNRRDQuotedString(str) {
    return '"' + str.replace('"', '\\"') + '"';
}

var whitespaceListSeparator = /[ \t]+/; // Note that this excludes other types of whitespace on purpose!
function parseNRRDWhitespaceSeparatedList(str, parseElement) {
    return str.split(whitespaceListSeparator).map(parseElement);
}

function parseNRRDType(descriptor) {
    switch(descriptor.toLowerCase()) {
    case "signed char":
    case "int8":
    case "int8_t":
        return 'int8';
    case "uchar":
    case "unsigned char":
    case "uint8":
    case "uint8_t":
        return 'uint8';
    case "short":
    case "short int":
    case "signed short":
    case "signed short int":
    case "int16":
    case "int16_t":
        return 'int16';
    case "ushort":
    case "unsigned short":
    case "unsigned short int":
    case "uint16":
    case "uint16_t":
        return 'uint16';
    case "int":
    case "signed int":
    case "int32":
    case "int32_t":
        return 'int32';
    case "uint":
    case "unsigned int":
    case "uint32":
    case "uint32_t":
        return 'uint32';
    case "longlong":
    case "long long":
    case "long long int":
    case "signed long long":
    case "signed long long int":
    case "int64":
    case "int64_t":
        return 'int64';
    case "ulonglong":
    case "unsigned long long":
    case "unsigned long long int":
    case "uint64":
    case "uint64_t":
        return 'uint64';
    case "float":
        return 'float';
    case "double":
        return 'double';
    case "block":
        return 'block';
    default:
        console.warn("Unrecognized NRRD type: " + descriptor);
        return descriptor;
    }
}

function parseNRRDEncoding(encoding) {
    switch(encoding.toLowerCase()) {
    case "raw":
        return "raw";
    case "txt":
    case "text":
    case "ascii":
        return "ascii";
    case "hex":
        return "hex";
    case "gz":
    case "gzip":
        return "gzip";
    case "bz2":
    case "bzip2":
        return "bzip2";
    default:
        console.warn("Unrecognized NRRD encoding: " + encoding);
        return encoding;
    }
}

function parseNRRDSpace(space) {
    switch(space.toLowerCase()) {
    case "right-anterior-superior":
    case "ras":
        return "right-anterior-superior";
    case "left-anterior-superior":
    case "las":
        return "left-anterior-superior";
    case "left-posterior-superior":
    case "lps":
        return "left-posterior-superior";
 	  case "right-anterior-superior-time":
 	  case "rast":
        return "right-anterior-superior-time";
    case "left-anterior-superior-time":
    case "last":
        return "left-anterior-superior-time";
    case "left-posterior-superior-time":
    case "lpst":
        return "left-posterior-superior-time";
    case "scanner-xyz":
        return "scanner-xyz";
    case "scanner-xyz-time":
        return "scanner-xyz-time";
    case "3d-right-handed":
        return "3D-right-handed";
    case "3d-left-handed":
        return "3D-left-handed";
    case "3d-right-handed-time":
        return "3D-right-handed-time";
    case "3d-left-handed-time":
        return "3D-left-handed-time";
    default:
        console.warn("Unrecognized space: " + space);
        return space;
    }
}

function parseNRRDEndian(endian) {
    switch(endian.toLowerCase()) {
    case 'little':
        return 'little';
    case 'big':
        return 'big';
    default:
        console.warn("Unrecognized NRRD endianness: " + endian);
        return endian;
    }
}

// Note that this function will never encounter the LIST data file specification format, as this is handled elsewhere.
var dataFileFormatRE = / (-?\d+) (-?\d+) (-?\d+)(?: (\d+))?$/;
function parseNRRDDataFile(dataFile) {
    var match = dataFileFormatRE.exec(dataFile);
    if (match) { // We have a format specification
        if (match.length == 5 && match[4]) { // subdim specification
            return {
                format: dataFile.substring(0, match.index),
                min: parseNRRDInteger(match[1]),
                max: parseNRRDInteger(match[2]),
                step: parseNRRDInteger(match[3]),
                subdim: parseNRRDInteger(match[4])
            };
        } else {
            return {
                format: dataFile.substring(0, match.index),
                min: parseNRRDInteger(match[1]),
                max: parseNRRDInteger(match[2]),
                step: parseNRRDInteger(match[3])
            };
        }
    } else { // Just a file
        return dataFile;
    }
}

function serializeNRRDDataFile(dataFile) {
    if ((typeof dataFile) == "string" || dataFile instanceof String) {
        return dataFile;
    } else if ('format' in dataFile && 'min' in dataFile && 'max' in dataFile && 'step' in dataFile) {
        if ('subdim' in dataFile) {
            return dataFile.format + " " + dataFile.min + " " + dataFile.max + " " + dataFile.step + " " + dataFile.subdim;
        } else {
            return dataFile.format + " " + dataFile.min + " " + dataFile.max + " " + dataFile.step;
        }
    } else {
        throw new Error("Unrecognized data file format!");
    }
}

function parseNRRDCenter(center) {
    switch(center.toLowerCase()) {
    case "cell":
        return "cell";
    case "node":
        return "node";
    case "???":
    case "none":
        return null;
    default:
        console.warn("Unrecognized NRRD center: " + center);
        return center;
    }
}

var NRRDKinds = {
    "domain": "domain",
    "space": "space",
    "time": "time",
    "list": "list",
    "point": "point",
    "vector": "vector",
    "covariant-vector": "covariant-vector",
    "normal": "normal",
    "stub": "stub",
    "scalar": "scalar",
    "complex": "complex",
    "2-vector": "2-vector",
    "3-color": "3-color",
    "rgb-color": "RGB-color",
    "hsv-color": "HSV-color",
    "xyz-color": "XYZ-color",
    "4-color": "4-color",
    "rgba-color": "RGBA-color",
    "3-vector": "3-vector",
    "3-gradient": "3-gradient",
    "3-normal": "3-normal",
    "4-vector": "4-vector",
    "quaternion": "quaternion",
    "2d-symmetric-matrix": "2D-symmetric-matrix",
    "2d-masked-symmetric-matrix": "2D-masked-symmetric-matrix",
    "2d-matrix": "2D-matrix",
    "2d-masked-matrix": "2D-masked-matrix",
    "3d-symmetric-matrix": "3D-symmetric-matrix",
    "3d-masked-symmetric-matrix": "3D-masked-symmetric-matrix",
    "3d-matrix": "3D-matrix",
    "3d-masked-matrix": "3D-masked-matrix",
    "???": null,
    "none": null
};
function parseNRRDKind(kind) {
    var kindLC = kind.toLowerCase();
    if (kindLC in NRRDKinds) return NRRDKinds[kindLC];
    console.warn("Unrecognized NRRD kind: " + kind);
    return kind;
}

function serializeNRRDOptional(a) {
    return a===null ? "???" : a;
}

var systemEndianness = (function() {
    var buf = new ArrayBuffer(4),
        intArr = new Uint32Array(buf),
        byteArr = new Uint8Array(buf);
    intArr[0] = 0x01020304;
    if (byteArr[0]==1 && byteArr[1]==2 && byteArr[2]==3 && byteArr[3]==4) {
        return 'big';
    } else if (byteArr[0]==4 && byteArr[1]==3 && byteArr[2]==2 && byteArr[3]==1) {
        return 'little';
    }
    console.warn("Unrecognized system endianness!");
    return undefined;
})();

function parseNRRDRawData(buffer, type, sizes, options) {
    var i, arr, view, totalLen = 1, endianFlag;
    for(i=0; i<sizes.length; i++) {
        if (sizes[i]<=0) throw new Error("Sizes should be a list of positive (>0) integers!");
        totalLen *= sizes[i];
    }
    if (type == 'block') {
        // Don't do anything special, just return the slice containing all blocks.
        return buffer.slice(0,totalLen*options.blockSize);
    } else if (type == 'int8' || type == 'uint8' || options.endian == systemEndianness) {
        switch(type) {
        case "int8":
            checkSize(1);
            return new Int8Array(buffer.slice(0,totalLen));
        case "uint8":
            checkSize(1);
            return new Uint8Array(buffer.slice(0,totalLen));
        case "int16":
            checkSize(2);
            return new Int16Array(buffer.slice(0,totalLen*2));
        case "uint16":
            checkSize(2);
            return new Uint16Array(buffer.slice(0,totalLen*2));
        case "int32":
            checkSize(4);
            return new Int32Array(buffer.slice(0,totalLen*4));
        case "uint32":
            checkSize(4);
            return new Uint32Array(buffer.slice(0,totalLen*4));
        //case "int64":
        //    checkSize(8);
        //    return new Int64Array(buffer.slice(0,totalLen*8));
        //case "uint64":
        //    checkSize(8);
        //    return new Uint64Array(buffer.slice(0,totalLen*8));
        case "float":
            checkSize(4);
            return new Float32Array(buffer.slice(0,totalLen*4));
        case "double":
            checkSize(8);
            return new Float64Array(buffer.slice(0,totalLen*8));
        default:
            console.warn("Unsupported NRRD type: " + type + ", returning raw buffer.");
            return undefined;
        }
    } else {
        switch(options.endian) {
        case 'big':
            endianFlag = false;
            break;
        case 'little':
            endianFlag = true;
            break;
        default:
            console.warn("Unsupported endianness in NRRD file: " + options.endian);
            return undefined;
        }
        view = new DataView(buffer);
        switch(type) {
        case "int8": // Note that here we do not need to check the size of the buffer, as the DataView.get methods should throw an exception if we read beyond the buffer.
            arr = new Int8Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getInt8(i);
            }
            return arr;
        case "uint8":
            arr = new Uint8Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getUint8(i);
            }
            return arr;
        case "int16":
            arr = new Int16Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getInt16(i*2);
            }
            return arr;
        case "uint16":
            arr = new Uint16Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getUint16(i*2);
            }
            return arr;
        case "int32":
            arr = new Int32Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getInt32(i*4);
            }
            return arr;
        case "uint32":
            arr = new Uint32Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getUint32(i*4);
            }
            return arr;
        //case "int64":
        //    arr = new Int64Array(totalLen);
        //    for(i=0; i<totalLen; i++) {
        //        arr[i] = view.getInt64(i*8);
        //    }
        //    return arr;
        //case "uint64":
        //    arr = new Uint64Array(totalLen);
        //    for(i=0; i<totalLen; i++) {
        //        arr[i] = view.getUint64(i*8);
        //    }
        //    return arr;
        case "float":
            arr = new Float32Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getFloat32(i*4);
            }
            return arr;
        case "double":
            arr = new Float64Array(totalLen);
            for(i=0; i<totalLen; i++) {
                arr[i] = view.getFloat64(i*8);
            }
            return arr;
        default:
            console.warn("Unsupported NRRD type: " + type + ", returning raw buffer.");
            return undefined;
        }
    }
    function checkSize(sizeOfType) {
        if (buffer.byteLength<totalLen*sizeOfType) throw new Error("NRRD file does not contain enough data!");
    }
}

var whitespaceDataValueListSeparatorRE = /[ \t\n\r\v\f]+/;
function parseNRRDTextData(buffer, type, sizes) {
    var i, buf8, str, strList, totalLen = 1;
    for(i=0; i<sizes.length; i++) {
        if (sizes[i]<=0) throw new Error("Sizes should be a list of positive (>0) integers!");
        totalLen *= sizes[i];
    }
    buf8 = new Uint8Array(buffer);
    str = String.fromCharCode.apply(null, buf8);
    strList = str.split(whitespaceDataValueListSeparatorRE);
    if (strList.length<totalLen) {
        throw new Error("Not enough data in NRRD file!");
    } else if (strList.length>totalLen) {
        if (strList[0] === '') strList = strList.slice(1); // Strictly speaking the spec doesn't (explicitly) allow whitespace in front of the first number, but let's be lenient.
        strList = strList.slice(0, totalLen);
    }
    switch(type) {
    case "int8":
        return new Int8Array(strList.map(parseNRRDInteger));
    case "uint8":
        return new Uint8Array(strList.map(parseNRRDInteger));
    case "int16":
        return new Int16Array(strList.map(parseNRRDInteger));
    case "uint16":
        return new Uint16Array(strList.map(parseNRRDInteger));
    case "int32":
        return new Int32Array(strList.map(parseNRRDInteger));
    case "uint32":
        return new Uint32Array(strList.map(parseNRRDInteger));
    //case "int64":
    //    return new Int64Array(strList.map(parseNRRDInteger));
    //case "uint64":
    //    return new Uint64Array(strList.map(parseNRRDInteger));
    case "float":
        return new Float32Array(strList.map(parseNRRDFloat));
    case "double":
        return new Float64Array(strList.map(parseNRRDFloat));
    default:
        console.warn("Unsupported NRRD type: " + type + ".");
        return undefined;
    }
}

// This ALWAYS returns an integer, or throws an exception.
function getNRRDTypeSize(type) {
    switch(type) {
    case "int8":
        return 1;
    case "uint8":
        return 1;
    case "int16":
        return 2;
    case "uint16":
        return 2;
    case "int32":
        return 4;
    case "uint32":
        return 4;
    case "int64":
        return 8;
    case "uint64":
        return 8;
    case "float":
        return 4;
    case "double":
        return 8;
    default:
        throw new Error("Do not know the size of NRRD type: " + type);
    }
}

function checkNRRD(ret) {
    // Always necessary fields
    if (ret.dimension===undefined) {
        throw new Error("Dimension missing from NRRD file!");
    } else if (ret.type===undefined) {
        throw new Error("Type missing from NRRD file!");
    } else if (ret.encoding===undefined) {
        throw new Error("Encoding missing from NRRD file!");
    } else if (ret.sizes===undefined) {
        throw new Error("Sizes missing from NRRD file!");
    }
    
    // Sometimes necessary fields
    if (ret.type != 'block' && ret.type != 'int8' && ret.type != 'uint8' &&
          ret.encoding != 'ascii' && ret.endian === undefined) {
        throw new Error("Endianness missing from NRRD file!");
    } else if (ret.type == 'block' && ret.blockSize === undefined) {
        throw new Error("Missing block size in NRRD file!");
    }
    
    // Check dimension and per-axis field lengths
    if (ret.dimension === 0) {
        throw new Error("Zero-dimensional NRRD file?");
    } else if (ret.dimension != ret.sizes.length) {
        throw new Error("Length of 'sizes' is different from 'dimension' in an NRRD file!");
    } else if (ret.spacings && ret.dimension != ret.spacings.length) {
        throw new Error("Length of 'spacings' is different from 'dimension' in an NRRD file!");
    } else if (ret.thicknesses && ret.dimension != ret.thicknesses.length) {
        throw new Error("Length of 'thicknesses' is different from 'dimension' in an NRRD file!");
    } else if (ret.axisMins && ret.dimension != ret.axisMins.length) {
        throw new Error("Length of 'axis mins' is different from 'dimension' in an NRRD file!");
    } else if (ret.axisMaxs && ret.dimension != ret.axisMaxs.length) {
        throw new Error("Length of 'axis maxs' is different from 'dimension' in an NRRD file!");
    } else if (ret.centers && ret.dimension != ret.centers.length) {
        throw new Error("Length of 'centers' is different from 'dimension' in an NRRD file!");
    } else if (ret.labels && ret.dimension != ret.labels.length) {
        throw new Error("Length of 'labels' is different from 'dimension' in an NRRD file!");
    } else if (ret.units && ret.dimension != ret.units.length) {
        throw new Error("Length of 'units' is different from 'dimension' in an NRRD file!");
    } else if (ret.kinds && ret.dimension != ret.kinds.length) {
        throw new Error("Length of 'kinds' is different from 'dimension' in an NRRD file!");
    }
    
    // TODO: Check space/orientation fields.
    
    // We should either have inline data or external data
    if ((ret.data === undefined || ret.data.length === 0) && (ret.buffer === undefined || ret.buffer.byteLength === 0) && ret.dataFile === undefined) {
        throw new Error("NRRD file has neither inline or external data!");
    }
}

function castTypedArray(data, type) {
    switch(type) {
    case "int8":
        return new Int8Array(data);
    case "uint8":
        return new Uint8Array(data);
    case "int16":
        return new Int16Array(data);
    case "uint16":
        return new Uint16Array(data);
    case "int32":
        return new Int32Array(data);
    case "uint32":
        return new Uint32Array(data);
    //case "int64":
    //    return new Int64Array(data);
    //case "uint64":
    //    return new Uint64Array(data);
    case "float":
        return new Float32Array(data);
    case "double":
        return new Float64Array(data);
    default:
        throw new Error("Cannot cast to NRRD type: " + type);
    }
}

function serializeToBuffer(data, type, endian) {
    var i, endianFlag, view, nativeSize = getNRRDTypeSize(type), buffer = new ArrayBuffer(data.length*nativeSize);
    switch(endian) {
    case 'big':
        endianFlag = false;
        break;
    case 'little':
        endianFlag = true;
        break;
    default:
        console.warn("Unsupported endianness in NRRD file: " + endian);
        return undefined;
    }
    view = new DataView(buffer);
    switch(type) {
    case "int8": // Note that here we do not need to check the size of the buffer, as the DataView.get methods should throw an exception if we read beyond the buffer.
        for(i=0; i<data.length; i++) {
            view.setInt8(i, data[i], endianFlag);
        }
        return buffer;
    case "uint8":
        for(i=0; i<data.length; i++) {
            view.setUint8(i, data[i], endianFlag);
        }
        return buffer;
    case "int16":
        for(i=0; i<data.length; i++) {
            view.setInt16(i*2, data[i], endianFlag);
        }
        return buffer;
    case "uint16":
        for(i=0; i<data.length; i++) {
            view.setUint16(i*2, data[i], endianFlag);
        }
        return buffer;
    case "int32":
        for(i=0; i<data.length; i++) {
            view.setInt32(i*4, data[i], endianFlag);
        }
        return buffer;
    case "uint32":
        for(i=0; i<data.length; i++) {
            view.setUint32(i*4, data[i], endianFlag);
        }
        return buffer;
    //case "int64":
    //    for(i=0; i<data.length; i++) {
    //        view.setInt64(i*8, data[i], endianFlag);
    //    }
    //    return buffer;
    //case "uint64":
    //    for(i=0; i<data.length; i++) {
    //        view.setUint64(i*8, data[i], endianFlag);
    //    }
    //    return buffer;
    case "float":
        for(i=0; i<data.length; i++) {
            view.setFloat32(i*4, data[i], endianFlag);
        }
        return buffer;
    case "double":
        for(i=0; i<data.length; i++) {
            view.setFloat64(i*8, data[i], endianFlag);
        }
        return buffer;
    default:
        console.warn("Cannot serialize NRRD type: " + type + ".");
        return undefined;
    }
}

function serializeToTextBuffer(data) {
    var i, strs = new Array(data.length), str, buffer, arr;
    for(i=0; i<data.length; i++) {
        strs[i] = '' + data[i];
    }
    str = strs.join(" ");
    buffer = new ArrayBuffer(str.length);
    arr = new Uint8Array(buffer);
    for(i=0; i<arr.length; i++) {
        arr[i] = str.charCodeAt(i);
    }
    return buffer;
}

  return nrrd;

}
nrrd = NRRD();


