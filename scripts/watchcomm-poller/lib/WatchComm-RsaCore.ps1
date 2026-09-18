$ErrorActionPreference = 'Stop'

$script:WatchCommBin = Join-Path $PSScriptRoot 'dimep-binaries'
$script:WatchCommAssembly = $null
$script:WatchCommRsaEncrypt = $null

function Initialize-WatchCommRsa {
  if ($script:WatchCommRsaEncrypt) { return }

  [AppDomain]::CurrentDomain.add_AssemblyResolve({
    param($s, $e)
    $name = ($e.Name -split ',')[0]
    $path = Join-Path $script:WatchCommBin ($name + '.dll')
    if (Test-Path -LiteralPath $path) { return [Reflection.Assembly]::LoadFrom($path) }
    return $null
  }) | Out-Null

  $script:WatchCommAssembly = [Reflection.Assembly]::LoadFrom((Join-Path $script:WatchCommBin 'WatchComm.dll'))
  $rsaType = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.encryption.RSAHelper')
  if (-not $rsaType) { throw 'RSAHelper type not found in WatchComm.dll' }

  $script:WatchCommRsaEncrypt = $rsaType.GetMethods(
    [Reflection.BindingFlags]'Public,NonPublic,Static,Instance,DeclaredOnly'
  ) | Where-Object { $_.Name -eq 'Encrypt' } | Select-Object -First 1

  if (-not $script:WatchCommRsaEncrypt) { throw 'RSAHelper.Encrypt not found' }
}

function Get-WatchCommEnumValue {
  param(
    [Parameter(Mandatory)][string]$TypeName,
    [Parameter(Mandatory)][string]$FieldName
  )

  Initialize-WatchCommRsa
  $type = $script:WatchCommAssembly.GetType($TypeName)
  if (-not $type) { throw "type not found: $TypeName" }
  $field = $type.GetField($FieldName, [Reflection.BindingFlags]'Public,Static')
  if (-not $field) { throw "field not found: $TypeName.$FieldName" }
  return $field.GetValue($null)
}

function Resolve-WatchCommProbeSpec {
  param([Parameter(Mandatory)][string]$ProbeSpec)

  if ($ProbeSpec -match '^(rsa|packet|aes):(.+)$') {
    return [PSCustomObject]@{
      CipherMode = $Matches[1]
      Probe = $Matches[2]
    }
  }

  return [PSCustomObject]@{
    CipherMode = 'rsa'
    Probe = $ProbeSpec
  }
}

function Get-WatchCommPacketBytes {
  param(
    [Parameter(Mandatory)][string]$MessageName,
    [byte]$MessageNumber = 0
  )

  Initialize-WatchCommRsa
  $msgType = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.api.MessageType')
  $protoType = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.api.WatchProtocolType')
  $packetType = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.impl.printpoint.PrintPointPacket')

  $message = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.api.MessageType' $MessageName
  $protocol = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.api.WatchProtocolType' 'PrintPointIII'
  $factory = $packetType.GetMethod(
    'PacketFactory',
    [Reflection.BindingFlags]'Public,Static',
    $null,
    [Type[]]@($msgType, [byte], $protoType),
    $null
  )
  if (-not $factory) { throw 'PrintPointPacket.PacketFactory not found' }

  $packet = $factory.Invoke($null, @($message, [byte]$MessageNumber, $protocol))
  $getPacket = $packet.GetType().GetMethod('GetPacket')
  if (-not $getPacket) { throw 'GetPacket not found on packet instance' }
  return [byte[]]$getPacket.Invoke($packet, $null)
}

function Get-WatchCommPlaintextBytes {
  param(
    [Parameter(Mandatory)][string]$Probe,
    [string]$PlaintextHex = ''
  )

  Initialize-WatchCommRsa

  switch ($Probe) {
    'empty' { return [byte[]]@() }
    'frame70' { return [byte[]](0xF8, 0xA1, 0x70, 0x01, 0x00, 0x00, 0xD0, 0xF0) }
    'status-inquiry' { return Get-WatchCommPacketBytes -MessageName 'StatusInquiry' }
    'inquiry-immediate-status' { return Get-WatchCommPacketBytes -MessageName 'InquiryImediateStatus' }
    'inquiry-mrp-registers' { return Get-WatchCommPacketBytes -MessageName 'InquiryMRPRegisters' }
    'inquiry-random-number' { return Get-WatchCommPacketBytes -MessageName 'InquiryRandomNumber' }
    'inquiry-serial' { return Get-WatchCommPacketBytes -MessageName 'InquirySerialNumberOfREPAndMemory' }
    'update-aes-params' {
      $aesMsgType = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.impl.printpoint.PrintPointUpdateAESParametersMessage')
      $aesMsg = [Activator]::CreateInstance($aesMsgType)
      $aesMsg.Key = '0123456789ABCDEF'
      $aesMsg.VectorIV = 'FEDCBA9876543210'
      $aesMsg.User = 'admin'
      $aesMsg.Password = 'admin'
      return [byte[]]$aesMsg.GetData()
    }
    'hex' {
      if (-not $PlaintextHex) { throw 'PlaintextHex is required when Probe=hex' }
      if ($PlaintextHex.Length % 2 -ne 0) { throw 'PlaintextHex must have an even number of characters' }
      $bytes = New-Object byte[] ($PlaintextHex.Length / 2)
      for ($i = 0; $i -lt $bytes.Length; $i++) {
        $bytes[$i] = [System.Convert]::ToByte($PlaintextHex.Substring($i * 2, 2), 16)
      }
      return $bytes
    }
    default { throw "Unknown probe: $Probe" }
  }
}

function Get-WatchCommProtocolInstance {
  param(
    [Parameter(Mandatory)][string]$ModulusHex,
    [string]$ExponentHex = '010001'
  )

  Initialize-WatchCommRsa
  $type = $script:WatchCommAssembly.GetType('org.cesar.dmplight.watchComm.impl.ConcreteProtocol')
  $instance = [Activator]::CreateInstance($type)
  $instance.RSAPublicKey = $ModulusHex
  $instance.RSAExponent = $ExponentHex
  return $instance
}

function Invoke-WatchCommEncryptData {
  param(
    [Parameter(Mandatory)][byte[]]$Plain,
    [Parameter(Mandatory)][string]$MessageName,
    [Parameter(Mandatory)][string]$ModulusHex,
    [string]$ExponentHex = '010001'
  )

  Initialize-WatchCommRsa
  $instance = Get-WatchCommProtocolInstance -ModulusHex $ModulusHex -ExponentHex $ExponentHex
  $type = $instance.GetType()
  $encryptData = $type.GetMethod('EncryptData', [Reflection.BindingFlags]'NonPublic,Instance')
  if (-not $encryptData) { throw 'ConcreteProtocol.EncryptData not found' }

  $message = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.api.MessageType' $MessageName
  $invokeArgs = New-Object object[] 2
  $invokeArgs[0] = [byte[]]$Plain
  $invokeArgs[1] = $message
  return [byte[]]$encryptData.Invoke($instance, $invokeArgs)
}

function Invoke-WatchCommAck {
  param(
    [Parameter(Mandatory)][string]$ProbeSpec,
    [Parameter(Mandatory)][string]$ModulusHex,
    [string]$ExponentHex = '010001',
    [string]$PlaintextHex = ''
  )

  $spec = Resolve-WatchCommProbeSpec -ProbeSpec $ProbeSpec
  $plain = Get-WatchCommPlaintextBytes -Probe $spec.Probe -PlaintextHex $PlaintextHex
  $messageName = switch ($spec.Probe) {
    'status-inquiry' { 'StatusInquiry' }
    'inquiry-immediate-status' { 'InquiryImediateStatus' }
    'inquiry-mrp-registers' { 'InquiryMRPRegisters' }
    'inquiry-random-number' { 'InquiryRandomNumber' }
    'inquiry-serial' { 'InquirySerialNumberOfREPAndMemory' }
    default { $null }
  }

  $cipher = switch ($spec.CipherMode) {
    'packet' { [byte[]]$plain }
    'aes' {
      if (-not $messageName) { throw "AES mode requires a PrintPoint message probe, got: $($spec.Probe)" }
      Invoke-WatchCommEncryptData -Plain $plain -MessageName $messageName -ModulusHex $ModulusHex -ExponentHex $ExponentHex
    }
    'rsa' {
      $encrypted = $script:WatchCommRsaEncrypt.Invoke($null, @([byte[]]$plain, $ExponentHex, $ModulusHex))
      [byte[]]$encrypted
    }
    default { throw "Unknown cipher mode: $($spec.CipherMode)" }
  }

  if (-not $cipher) { throw 'WatchComm ACK returned null' }
  return [PSCustomObject]@{
    Probe = $ProbeSpec
    CipherMode = $spec.CipherMode
    PlaintextLength = $plain.Length
    PlaintextHex = if ($plain.Length -gt 0) { ([BitConverter]::ToString($plain)).Replace('-', '') } else { '' }
    CipherLength = $cipher.Length
    CipherBase64 = [Convert]::ToBase64String([byte[]]$cipher)
  }
}

function Invoke-WatchCommEncrypt {
  param(
    [Parameter(Mandatory)][string]$Probe,
    [Parameter(Mandatory)][string]$ModulusHex,
    [string]$ExponentHex = '010001',
    [string]$PlaintextHex = ''
  )

  return Invoke-WatchCommAck -ProbeSpec $Probe -ModulusHex $ModulusHex -ExponentHex $ExponentHex -PlaintextHex $PlaintextHex
}
